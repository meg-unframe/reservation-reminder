import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../fixtures/events.json";
import { GoogleAuthError, GoogleCalendarSource } from "../../../src/adapters/google/GoogleCalendarSource";
import { StaticAccessTokenProvider } from "../../../src/adapters/google/StaticAccessTokenProvider";
import worker from "../../../src/index";
import { runDailyJudgment } from "../../../src/usecases/runDailyJudgment";
import { seedFixtureCustomers } from "../../../src/usecases/seedFixtureCustomers";
import { CRON_PRIMARY } from "../../../src/schedule";
import {
  fakeGoogleFetch,
  googleEventsFromFixture,
  TEST_CALENDAR_ID,
  TEST_TOKEN,
} from "../../helpers/fakeGoogleCalendar";
import { customerDeps, judgmentDeps, judgments, RecordingLogger, sendLogs } from "../../helpers/judgmentDeps";
import { resetDb } from "../../helpers/resetDb";

// 実際の Google API には接続しない。偽の応答（架空予定）で判定から送信シミュレーションまでを確かめる
const DATE = "2026-10-30";

beforeEach(async () => {
  await resetDb();
  await seedFixtureCustomers(customerDeps());
});

function googleSource(fetch: ReturnType<typeof fakeGoogleFetch>["fetch"]) {
  return new GoogleCalendarSource({ calendarId: TEST_CALENDAR_ID, tokens: new StaticAccessTokenProvider(TEST_TOKEN), fetch });
}

describe("Google カレンダー（偽の応答）での判定", () => {
  it("Fixture と同じ架空予定なら、判定結果も Fixture の期待値と一致する", async () => {
    const outcome = await runDailyJudgment(judgmentDeps(googleSource(fakeGoogleFetch([googleEventsFromFixture(DATE)]).fetch)), {
      targetDate: DATE,
      trigger: "cron",
    });

    const actual = Object.fromEntries((await judgments().listItems(DATE)).map((i) => [i.event.eventId, i.result]));
    expect(actual).toEqual(Object.fromEntries(fixture.events.map((e) => [e.id, e.expected])));
    expect(outcome).toMatchObject({ status: "success", counts: { notify: 5, review: 4, excluded: 3, simulated: 5 } });
    expect((await sendLogs().list({ targetDate: DATE, limit: 100 })).every((l) => l.mode === "simulation")).toBe(true);
  });

  it("一時的なエラー（503）は再試行して成功する", async () => {
    const fake = fakeGoogleFetch((call) =>
      call < 2 ? new Response("{}", { status: 503 }) : Response.json({ items: googleEventsFromFixture(DATE) }),
    );
    const logger = new RecordingLogger();
    const outcome = await runDailyJudgment(judgmentDeps(googleSource(fake.fetch), logger), { targetDate: DATE, trigger: "cron" });

    expect(outcome.status).toBe("success");
    expect(fake.requests).toHaveLength(3);
    expect(logger.entries.filter((e) => e.event === "judgment.calendar_retry").map((e) => e.fields?.errorCode)).toEqual([
      "GoogleCalendarHttpError",
      "GoogleCalendarHttpError",
    ]);
  });

  it("認証エラー（トークン期限切れなど）は再試行せず、失敗として記録し、送信もしない", async () => {
    const fake = fakeGoogleFetch(() => new Response("{}", { status: 401 }));
    await expect(
      runDailyJudgment(judgmentDeps(googleSource(fake.fetch)), { targetDate: DATE, trigger: "cron" }),
    ).rejects.toThrow(GoogleAuthError);

    expect(fake.requests).toHaveLength(1);
    const [run] = await judgments().listRuns({ limit: 1 });
    expect(run).toMatchObject({ status: "failed", errorCode: "GoogleAuthError" });
    expect(await sendLogs().list({ targetDate: DATE, limit: 100 })).toEqual([]);
  });
});

describe("Worker の設定から Google を選んだとき（ローカル・fetch はモック）", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ items: googleEventsFromFixture(DATE) }));
  });

  afterEach(() => vi.restoreAllMocks());

  const googleEnv = {
    ...env,
    ENVIRONMENT: "local",
    CALENDAR_SOURCE: "google",
    CALENDAR_ID: TEST_CALENDAR_ID,
    GOOGLE_ACCESS_TOKEN: TEST_TOKEN,
  };

  it("18:00 の cron で、許可リスト経由で Google API だけを呼び、送信はシミュレーションのみ", async () => {
    const ctx = createExecutionContext();
    await worker.scheduled(
      createScheduledController({ cron: CRON_PRIMARY, scheduledTime: new Date("2026-10-29T09:00:00Z") }),
      googleEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    const hosts = (fetchSpy.mock.calls as unknown[][]).map((args) => new URL(String(args[0])).hostname);
    expect(hosts).toEqual(["www.googleapis.com"]);
    const [run] = await judgments().listRuns({ limit: 1 });
    expect(run).toMatchObject({ targetDate: DATE, status: "success" });
    const logs = await sendLogs().list({ targetDate: DATE, limit: 100 });
    expect(logs).toHaveLength(5);
    expect(logs.every((l) => l.mode === "simulation")).toBe(true);
  });

  it("本番設定では Google を使えず、通信も判定もしない", async () => {
    const ctx = createExecutionContext();
    await expect(
      worker.scheduled(
        createScheduledController({ cron: CRON_PRIMARY, scheduledTime: new Date("2026-10-29T09:00:00Z") }),
        { ...googleEnv, ENVIRONMENT: "production" },
        ctx,
      ),
    ).rejects.toThrow("ENVIRONMENT=local");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await judgments().listRuns({ limit: 1 })).toEqual([]);
  });
});
