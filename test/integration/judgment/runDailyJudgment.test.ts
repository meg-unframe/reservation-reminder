import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../fixtures/events.json";
import { FixtureCalendarSource } from "../../../src/adapters/fixture/FixtureCalendarSource";
import { consoleLogger } from "../../../src/lib/logger";
import { registerCustomer } from "../../../src/usecases/customers";
import { runDailyJudgment } from "../../../src/usecases/runDailyJudgment";
import { seedFixtureCustomers } from "../../../src/usecases/seedFixtureCustomers";
import {
  customerDeps,
  InMemoryCalendar,
  judgmentDeps,
  judgments,
  RecordingLogger,
  sendLogs,
} from "../../helpers/judgmentDeps";
import { resetDb } from "../../helpers/resetDb";

const DATE = "2026-10-30"; // 金曜日

beforeEach(resetDb);

describe("Fixture シナリオ（架空顧客・架空予定）", () => {
  beforeEach(async () => {
    await seedFixtureCustomers(customerDeps());
  });

  it("全予定が期待どおりに判定される", async () => {
    const outcome = await runDailyJudgment(judgmentDeps(new FixtureCalendarSource()), { targetDate: DATE, trigger: "cron" });
    const items = await judgments().listItems(DATE);

    const actual = Object.fromEntries(items.map((i) => [i.event.eventId.replace(`-${DATE}`, ""), i.result]));
    const expected = Object.fromEntries(fixture.events.map((e) => [e.id, e.expected]));
    expect(actual).toEqual(expected);
    expect(outcome).toMatchObject({
      status: "success",
      counts: { notify: 5, review: 4, excluded: 3, simulated: 5, duplicate: 0 },
    });
  });

  it("旧表示名のタイトルは警告付きで通知対象になる", async () => {
    await runDailyJudgment(judgmentDeps(new FixtureCalendarSource()), { targetDate: DATE, trigger: "cron" });
    const item = (await judgments().listItems(DATE)).find((i) => i.event.eventId === `fx-04-${DATE}`);
    expect(item).toMatchObject({ result: "notify", reason: "matched_past_name", warning: "title_outdated", karteNo: "0001" });
  });

  it("要確認の理由が区別される", async () => {
    await runDailyJudgment(judgmentDeps(new FixtureCalendarSource()), { targetDate: DATE, trigger: "cron" });
    const reasons = Object.fromEntries(
      (await judgments().listItems(DATE)).filter((i) => i.result === "review").map((i) => [i.event.eventId.slice(0, 5), i.reason]),
    );
    expect(reasons).toEqual({
      "fx-05": "name_mismatch",
      "fx-06": "name_mismatch",
      "fx-07": "inactive_customer",
      "fx-08": "unknown_karte_no",
    });
  });

  it("本文は「姓様」で始まり、頭文字・カルテ番号・「さん」を含まない", async () => {
    await runDailyJudgment(judgmentDeps(new FixtureCalendarSource()), { targetDate: DATE, trigger: "cron" });
    const logs = await sendLogs().list({ targetDate: DATE, limit: 100 });
    const byEvent = Object.fromEntries(logs.map((l) => [l.eventId.slice(0, 5), l.body]));
    expect(byEvent).toEqual({
      "fx-01": "田中様 明日10月30日（金）10:00〜 カットのご予約を承っております。",
      "fx-02": "田中様 明日10月30日（金）11:00〜 カラーのご予約を承っております。",
      "fx-03": "田中様 明日10月30日（金）12:00〜 ご予約を承っております。",
      "fx-04": "田中様 明日10月30日（金）13:00〜 前髪カットのご予約を承っております。",
      "fx-12": "斎藤様 明日10月30日（金）19:00〜 パーマのご予約を承っております。",
    });
    for (const log of logs) {
      expect(log.mode).toBe("simulation");
      expect(log.body).not.toMatch(/\d{4}|\(.\)|さん/);
    }
  });

  it("外部への通信（fetch）を一切行わない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await runDailyJudgment(judgmentDeps(new FixtureCalendarSource()), { targetDate: DATE, trigger: "cron" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("実際のログ出力に氏名・本文・タイトルを含まない", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await runDailyJudgment({ ...judgmentDeps(new FixtureCalendarSource()), logger: consoleLogger }, { targetDate: DATE, trigger: "cron" });
      const output = [...log.mock.calls, ...err.mock.calls].flat().join("\n");
      expect(output).toContain("judgment.finished");
      expect(output).not.toMatch(/田中|佐藤|斉藤|斎藤|鈴木|山本|様|ご予約/);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});

describe("冪等性（2回実行しても重複しない）", () => {
  beforeEach(async () => {
    await seedFixtureCustomers(customerDeps());
  });

  it("同日の定時判定が成功済みなら、cron / cron_retry はスキップする", async () => {
    const deps = judgmentDeps(new FixtureCalendarSource());
    const first = await runDailyJudgment(deps, { targetDate: DATE, trigger: "cron" });
    const second = await runDailyJudgment(deps, { targetDate: DATE, trigger: "cron" });
    const retry = await runDailyJudgment(deps, { targetDate: DATE, trigger: "cron_retry" });

    expect(second).toEqual({ status: "skipped", runId: first.runId });
    expect(retry).toEqual({ status: "skipped", runId: first.runId });
    expect(await judgments().listRuns({ targetDate: DATE, limit: 10 })).toHaveLength(1);
    expect(await sendLogs().countInJstMonth("2026-10")).toBe(5);
  });

  it("手動の再判定はスナップショットを作り直すが、送信ログは重複しない", async () => {
    const deps = judgmentDeps(new FixtureCalendarSource());
    await runDailyJudgment(deps, { targetDate: DATE, trigger: "cron" });
    const rerun = await runDailyJudgment(deps, { targetDate: DATE, trigger: "manual" });

    expect(rerun).toMatchObject({ status: "success", counts: { simulated: 0, duplicate: 5 } });
    expect(await judgments().listItems(DATE)).toHaveLength(12);
    expect(await sendLogs().list({ targetDate: DATE, limit: 100 })).toHaveLength(5);
  });

  it("手動判定が先にあっても 18:00 の定時判定は実行される", async () => {
    const deps = judgmentDeps(new FixtureCalendarSource());
    await runDailyJudgment(deps, { targetDate: DATE, trigger: "manual" });
    const cron = await runDailyJudgment(deps, { targetDate: DATE, trigger: "cron" });
    expect(cron).toMatchObject({ status: "success", counts: { simulated: 0, duplicate: 5 } });
  });
});

describe("予定の変化と障害", () => {
  const calendar = new InMemoryCalendar();
  const event = (id: string, title: string, startAt: string) => ({
    eventId: id,
    cancelled: false,
    allDay: false,
    title,
    description: "",
    startAt,
    endAt: startAt.replace(/T(\d{2})/, (_, h: string) => `T${String(Number(h) + 1).padStart(2, "0")}`),
  });

  beforeEach(async () => {
    calendar.events = [event("e1", "田中様（0001）", `${DATE}T10:00:00+09:00`)];
    calendar.failuresBeforeSuccess = 0;
    calendar.calls = 0;
    await registerCustomer(customerDeps(), { familyName: "田中", givenName: "花子" });
    await registerCustomer(customerDeps(), { familyName: "佐藤", givenName: "健" });
  });

  it("再判定時に追加された予約だけが新たに記録される", async () => {
    const deps = judgmentDeps(calendar);
    await runDailyJudgment(deps, { targetDate: DATE, trigger: "cron" });
    calendar.events.push(event("e2", "佐藤様（0002）", `${DATE}T11:00:00+09:00`));
    const rerun = await runDailyJudgment(deps, { targetDate: DATE, trigger: "manual" });
    expect(rerun).toMatchObject({ counts: { simulated: 1, duplicate: 1 } });
  });

  it("対象日に始まらない予定（前日から日をまたぐ予定など）はスナップショットに含めない", async () => {
    calendar.events.push(event("prev", "佐藤様（0002）", "2026-10-29T23:30:00+09:00"));
    await runDailyJudgment(judgmentDeps(calendar), { targetDate: DATE, trigger: "cron" });
    expect((await judgments().listItems(DATE)).map((i) => i.event.eventId)).toEqual(["e1"]);
  });

  it("一時的な取得失敗は再試行して成功する", async () => {
    calendar.failuresBeforeSuccess = 2;
    const logger = new RecordingLogger();
    const outcome = await runDailyJudgment(judgmentDeps(calendar, logger), { targetDate: DATE, trigger: "cron" });
    expect(outcome.status).toBe("success");
    expect(calendar.calls).toBe(3);
    expect(logger.entries.filter((e) => e.event === "judgment.calendar_retry")).toHaveLength(2);
  });

  it("再試行しても失敗すれば failed を記録して例外を投げ、保険実行で回復できる", async () => {
    calendar.failuresBeforeSuccess = 4;
    const deps = judgmentDeps(calendar);
    await expect(runDailyJudgment(deps, { targetDate: DATE, trigger: "cron" })).rejects.toThrow("calendar unavailable");
    expect(calendar.calls).toBe(4);
    const [failed] = await judgments().listRuns({ targetDate: DATE, limit: 1 });
    expect(failed).toMatchObject({ status: "failed", errorCode: "Error", trigger: "cron" });
    expect(await sendLogs().countInJstMonth("2026-10")).toBe(0);

    const retry = await runDailyJudgment(deps, { targetDate: DATE, trigger: "cron_retry" });
    expect(retry).toMatchObject({ status: "success", counts: { simulated: 1 } });
  });
});
