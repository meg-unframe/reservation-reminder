import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../../src/domain/types";
import { tomorrowInJst } from "../../../src/domain/jstDate";
import { registerCustomer } from "../../../src/usecases/customers";
import { runDailyJudgment } from "../../../src/usecases/runDailyJudgment";
import { createApp } from "../../../src/web/app";
import { customerDeps, InMemoryCalendar, judgmentDeps } from "../../helpers/judgmentDeps";
import { resetDb } from "../../helpers/resetDb";

const ORIGIN = "http://localhost";
const DATE = tomorrowInJst(new Date()); // ダッシュボードは実時刻の「明日」を見る
const calendar = new InMemoryCalendar();
const app = createApp({ calendar });

const ev = (eventId: string, title: string, hour: number): CalendarEvent => ({
  eventId,
  cancelled: false,
  allDay: false,
  title,
  description: "",
  startAt: `${DATE}T${String(hour).padStart(2, "0")}:00:00+09:00`,
  endAt: `${DATE}T${String(hour + 1).padStart(2, "0")}:00:00+09:00`,
});

const get = (path: string) => app.fetch(new Request(`${ORIGIN}${path}`), env);
const post = (path: string, form: Record<string, string>, origin = ORIGIN) =>
  app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
      body: new URLSearchParams(form),
    }),
    env,
  );

beforeEach(async () => {
  await resetDb();
  calendar.failuresBeforeSuccess = 0;
  calendar.events = [ev("e1", "田中様（0001）", 10)];
  await registerCustomer(customerDeps(), { familyName: "田中", givenName: "花子" });
  await registerCustomer(customerDeps(), { familyName: "佐藤", givenName: "健" });
  await runDailyJudgment(judgmentDeps(calendar), { targetDate: DATE, trigger: "cron" });
  calendar.events.push(ev("e2", "佐藤様（0002）", 18)); // 18:00 判定後に追加
});

function fingerprintIn(html: string): string {
  const fp = /name="fingerprint" value="([^"]+)"/.exec(html)?.[1];
  if (!fp) throw new Error("fingerprint not found");
  return fp.replaceAll("&amp;", "&");
}

describe("判定後の変更画面", () => {
  it("判定後に追加された予約を未確認として表示する", async () => {
    const html = await (await get(`/changes?date=${DATE}`)).text();
    expect(html).toContain("未確認（1件）");
    expect(html).toContain("佐藤様（0002）");
    expect(html).toContain("リマインダーは送信されていません");
  });

  it("ダッシュボードに未確認件数の警告が出る", async () => {
    const html = await (await get("/")).text();
    expect(html).toContain("判定後の変更（追加・変更・削除）が 1 件あります");
  });

  it("確認済みにすると未確認から外れ、ダッシュボードの警告も消える", async () => {
    const fp = fingerprintIn(await (await get(`/changes?date=${DATE}`)).text());
    const res = await post("/changes/ack", { date: DATE, fingerprint: fp });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`/changes?date=${DATE}&msg=acked`);

    const html = await (await get(`/changes?date=${DATE}&msg=acked`)).text();
    expect(html).toContain("確認済みにしました。");
    expect(html).toContain("未確認（0件）");
    expect(html).toContain("確認済み（1件）");
    expect(await (await get("/")).text()).not.toContain("判定後の変更（追加・変更・削除）が");
  });

  it("差分にない fingerprint は 409 で記録しない", async () => {
    expect((await post("/changes/ack", { date: DATE, fingerprint: "added|forged" })).status).toBe(409);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM change_acks").first("n")).toBe(0);
  });

  it("別オリジンからの確認済み操作は 403", async () => {
    const fp = fingerprintIn(await (await get(`/changes?date=${DATE}`)).text());
    expect((await post("/changes/ack", { date: DATE, fingerprint: fp }, "https://evil.example.com")).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM change_acks").first("n")).toBe(0);
  });

  it("カレンダー取得に失敗しても画面は表示し、失敗を知らせる", async () => {
    calendar.failuresBeforeSuccess = 100;
    const changes = await get(`/changes?date=${DATE}`);
    expect(changes.status).toBe(200);
    expect(await changes.text()).toContain("カレンダーの取得に失敗しました");
    const dashboard = await get("/");
    expect(dashboard.status).toBe(200);
    expect(await dashboard.text()).toContain("判定後の変更を確認できませんでした");
  });

  it("未判定の日はその旨を表示する", async () => {
    expect(await (await get("/changes?date=2026-12-25")).text()).toContain("まだ判定されていません");
  });
});
