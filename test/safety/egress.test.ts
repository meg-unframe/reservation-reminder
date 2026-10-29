import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index";
import { assertAllowedEgress, EgressBlockedError } from "../../src/lib/egress";
import { CRON_PRIMARY, CRON_RETRY } from "../../src/schedule";
import { resetDb } from "../helpers/resetDb";
import { sourceFiles } from "./repoFiles";

describe("外部通信の許可リスト", () => {
  it("src で fetch() を直接呼ぶのは lib/egress.ts だけ", () => {
    // `app.fetch` や `worker.fetch(` などのメソッド呼び出しは対象外
    const directFetch = /(?<![.\w])fetch\s*\(/;
    const hits = Object.entries(sourceFiles)
      .filter(([path, content]) => path !== "src/lib/egress.ts" && directFetch.test(content))
      .map(([path]) => path);
    expect(hits).toEqual([]);
  });

  it.each(["https://oauth2.googleapis.com/token", "https://www.googleapis.com/calendar/v3/calendars/x/events"])(
    "Google カレンダー API は許可: %s",
    (url) => expect(() => assertAllowedEgress(url)).not.toThrow(),
  );

  it.each([
    "https://api.line.me/v2/bot/message/push",
    "https://api-data.line.me/v2/bot/message/x/content",
    "http://www.googleapis.com/calendar/v3", // https 以外
    "https://oauth2.googleapis.com.evil.example/token", // 似たドメイン
    "https://evil.example/?u=https://www.googleapis.com",
    "https://example.com",
  ])("それ以外は拒否: %s", (url) => {
    expect(() => assertAllowedEgress(url)).toThrow(EgressBlockedError);
  });
});

describe("通しの操作で外部通信が発生せず、ログに個人情報が出ないこと", () => {
  const ORIGIN = "http://localhost";
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(async () => {
    await resetDb();
    fetchSpy = vi.spyOn(globalThis, "fetch");
    logs = [];
    const capture = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
  });

  afterEach(() => vi.restoreAllMocks());

  async function request(path: string, form?: Record<string, string>) {
    const ctx = createExecutionContext();
    const init: RequestInit = form
      ? {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
          body: new URLSearchParams(form),
        }
      : {};
    const res = await worker.fetch(new Request(`${ORIGIN}${path}`, init), env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  async function cron(expr: string, at: string) {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: expr, scheduledTime: new Date(at) }), env, ctx);
    await waitOnExecutionContext(ctx);
  }

  it("投入→定時判定→全画面→顧客操作→手動判定→確認済み", async () => {
    expect((await request("/dev/seed", {})).status).toBe(200);
    await cron(CRON_PRIMARY, "2026-10-29T09:00:00Z");
    await cron(CRON_RETRY, "2026-10-29T09:10:00Z");

    for (const path of [
      "/",
      "/judgments?date=2026-10-30",
      "/changes?date=2026-10-30",
      "/send-logs?month=2026-10",
      "/customers",
      "/customers/0001",
      "/customers/new",
      "/judge",
    ]) {
      expect((await request(path)).status, path).toBe(200);
    }
    expect((await request("/customers", { familyName: "佐藤", givenName: "花" })).status).toBe(200); // 確認画面
    expect((await request("/customers", { familyName: "佐藤", givenName: "花", confirm: "1" })).status).toBe(303);
    expect((await request("/customers/0008", { familyName: "佐藤", givenName: "華", confirm: "1" })).status).toBe(303);
    expect((await request("/customers/0008/deactivate", { confirm: "1" })).status).toBe(303);
    expect((await request("/judge", { date: "2026-10-31" })).status).toBe(303);
    expect((await request("/changes/ack", { date: "2026-10-30", fingerprint: "x" })).status).toBe(409);

    expect(fetchSpy).not.toHaveBeenCalled();
    const output = logs.join("\n");
    expect(output).toContain("judgment.finished");
    expect(output).not.toMatch(/田中|佐藤|斉藤|斎藤|鈴木|山本|花子|友子|様|ご予約/);
  });
});
