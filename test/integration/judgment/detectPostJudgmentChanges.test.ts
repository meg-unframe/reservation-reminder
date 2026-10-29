import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ChangeAckRepository } from "../../../src/adapters/d1/D1ChangeAckRepository";
import type { CalendarEvent } from "../../../src/domain/types";
import { registerCustomer } from "../../../src/usecases/customers";
import {
  acknowledgeChange,
  detectPostJudgmentChanges,
  unackedCount,
  UnknownChangeError,
  type ChangeDeps,
} from "../../../src/usecases/detectPostJudgmentChanges";
import { runDailyJudgment } from "../../../src/usecases/runDailyJudgment";
import { customerDeps, fixedClock, InMemoryCalendar, judgmentDeps, judgments } from "../../helpers/judgmentDeps";
import { resetDb } from "../../helpers/resetDb";

const DATE = "2026-10-30";

function event(eventId: string, title: string, hour: number, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const hh = String(hour).padStart(2, "0");
  const end = String(hour + 1).padStart(2, "0");
  return {
    eventId,
    cancelled: false,
    allDay: false,
    title,
    description: "",
    startAt: `${DATE}T${hh}:00:00+09:00`,
    endAt: `${DATE}T${end}:00:00+09:00`,
    ...overrides,
  };
}

const calendar = new InMemoryCalendar();
const changeDeps = (): ChangeDeps => ({
  calendar,
  judgments: judgments(),
  acks: new D1ChangeAckRepository(env.DB),
  clock: fixedClock,
});
const judge = (trigger: "cron" | "manual" = "cron") => runDailyJudgment(judgmentDeps(calendar), { targetDate: DATE, trigger });

beforeEach(async () => {
  await resetDb();
  calendar.failuresBeforeSuccess = 0;
  calendar.events = [event("e1", "田中様（0001）", 10), event("e2", "佐藤様（0002）", 11), event("e3", "鈴木様（0003）", 12)];
  for (const [familyName, givenName] of [
    ["田中", "花子"],
    ["佐藤", "健"],
    ["鈴木", "一郎"],
    ["高橋", "二郎"],
  ] as const) {
    await registerCustomer(customerDeps(), { familyName, givenName });
  }
});

describe("detectPostJudgmentChanges", () => {
  it("未判定の日は judged=false", async () => {
    expect(await detectPostJudgmentChanges(changeDeps(), DATE)).toEqual({ date: DATE, judged: false });
  });

  it("失敗した判定しかない日も judged=false", async () => {
    calendar.failuresBeforeSuccess = 10;
    await expect(judge()).rejects.toThrow();
    calendar.failuresBeforeSuccess = 0;
    expect((await detectPostJudgmentChanges(changeDeps(), DATE)).judged).toBe(false);
  });

  it("判定直後は変更なし", async () => {
    await judge();
    const view = await detectPostJudgmentChanges(changeDeps(), DATE);
    expect(view).toMatchObject({ judged: true, changes: [] });
  });

  it("判定後の追加・時刻変更・キャンセルを検知する", async () => {
    await judge();
    calendar.events = [
      event("e1", "田中様（0001）", 15), // 10:00 → 15:00
      event("e2", "佐藤様（0002）", 11, { cancelled: true }),
      event("e3", "鈴木様（0003）", 12),
      event("e4", "高橋様（0004）", 9), // 判定後に追加
      event("p1", "歯医者", 13), // 私用は無視
    ];
    const view = await detectPostJudgmentChanges(changeDeps(), DATE);
    if (!view.judged) throw new Error("judged expected");
    expect(view.changes.map((c) => [c.kind, c.eventId, c.acked])).toEqual([
      ["added", "e4", false],
      ["removed", "e2", false],
      ["changed", "e1", false],
    ]);
    expect(unackedCount(view)).toBe(3);
  });

  it("消えた予定も削除として検知する", async () => {
    await judge();
    calendar.events = calendar.events.filter((e) => e.eventId !== "e3");
    const view = await detectPostJudgmentChanges(changeDeps(), DATE);
    expect(view.judged && view.changes.map((c) => [c.kind, c.eventId])).toEqual([["removed", "e3"]]);
  });

  it("自動では再判定・再送しない（スナップショットと送信ログは変わらない）", async () => {
    await judge();
    calendar.events.push(event("e4", "高橋様（0004）", 9));
    await detectPostJudgmentChanges(changeDeps(), DATE);
    expect(await judgments().listItems(DATE)).toHaveLength(3);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM send_logs").first("n")).toBe(3);
  });

  it("手動で再判定すると、その時点が新しい比較基準になる", async () => {
    await judge();
    calendar.events.push(event("e4", "高橋様（0004）", 9));
    await judge("manual");
    expect(unackedCount(await detectPostJudgmentChanges(changeDeps(), DATE))).toBe(0);
  });
});

describe("確認済み", () => {
  it("確認済みにした変更は acked になり、未確認数から外れる", async () => {
    await judge();
    calendar.events.push(event("e4", "高橋様（0004）", 9));
    const before = await detectPostJudgmentChanges(changeDeps(), DATE);
    const [change] = before.judged ? before.changes : [];
    await acknowledgeChange(changeDeps(), DATE, change!.fingerprint);
    await acknowledgeChange(changeDeps(), DATE, change!.fingerprint); // 二重でもエラーにならない

    const after = await detectPostJudgmentChanges(changeDeps(), DATE);
    expect(after.judged && after.changes.map((c) => c.acked)).toEqual([true]);
    expect(unackedCount(after)).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM change_acks").first("n")).toBe(1);
  });

  it("確認済みの予定がさらに変わると、再び未確認として出る", async () => {
    await judge();
    calendar.events[0] = event("e1", "田中様（0001）", 15);
    const first = await detectPostJudgmentChanges(changeDeps(), DATE);
    await acknowledgeChange(changeDeps(), DATE, first.judged ? first.changes[0]!.fingerprint : "");

    calendar.events[0] = event("e1", "田中様（0001）", 16);
    const second = await detectPostJudgmentChanges(changeDeps(), DATE);
    expect(second.judged && second.changes.map((c) => [c.kind, c.acked])).toEqual([["changed", false]]);
  });

  it("現在の差分にない fingerprint は記録しない", async () => {
    await judge();
    await expect(acknowledgeChange(changeDeps(), DATE, "added|forged|x")).rejects.toThrow(UnknownChangeError);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM change_acks").first("n")).toBe(0);
  });
});
