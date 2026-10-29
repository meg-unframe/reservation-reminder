import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/index";
import { CRON_PRIMARY, CRON_RETRY } from "../../src/schedule";
import { judgments, sendLogs } from "../helpers/judgmentDeps";
import { resetDb } from "../helpers/resetDb";

beforeEach(resetDb);

async function seed(overrides: Partial<typeof env> = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost/dev/seed", { method: "POST" }), { ...env, ...overrides }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function runCron(cron: string, scheduledTime: Date) {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron, scheduledTime }), env, ctx);
  await waitOnExecutionContext(ctx);
}

describe("POST /dev/seed", () => {
  it("ローカルでは架空顧客を投入し、2回目は何もしない", async () => {
    expect(await (await seed()).json()).toEqual({ seeded: 7 });
    expect(await (await seed()).json()).toEqual({ seeded: 0 });
  });

  it("本番環境では存在しない（404）", async () => {
    expect((await seed({ ENVIRONMENT: "production" })).status).toBe(404);
  });

  it("SEND_MODE が simulation 以外なら全リクエストを拒否する（500・処理しない）", async () => {
    const res = await seed({ SEND_MODE: "live" });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("SEND_MODE"); // 設定内容を応答に漏らさない
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM customers").first("n")).toBe(0);
  });
});

describe("scheduled（定時判定）", () => {
  it("18:00 JST の cron で翌日分を判定し、送信をシミュレーションする", async () => {
    await seed();
    // 2026-10-29 09:00 UTC = 18:00 JST → 対象日は 10/30
    await runCron(CRON_PRIMARY, new Date("2026-10-29T09:00:00Z"));

    const [run] = await judgments().listRuns({ limit: 1 });
    expect(run).toMatchObject({ targetDate: "2026-10-30", trigger: "cron", status: "success" });
    expect(await judgments().listItems("2026-10-30")).toHaveLength(12);
    expect(await sendLogs().list({ targetDate: "2026-10-30", limit: 100 })).toHaveLength(5);
  });

  it("保険実行は本判定の成功後には何もしない", async () => {
    await seed();
    await runCron(CRON_PRIMARY, new Date("2026-10-29T09:00:00Z"));
    await runCron(CRON_RETRY, new Date("2026-10-29T09:10:00Z"));
    expect(await judgments().listRuns({ targetDate: "2026-10-30", limit: 10 })).toHaveLength(1);
  });

  it("SEND_MODE が simulation 以外なら判定しない", async () => {
    const ctx = createExecutionContext();
    await expect(
      worker.scheduled(
        createScheduledController({ cron: CRON_PRIMARY, scheduledTime: new Date("2026-10-29T09:00:00Z") }),
        { ...env, SEND_MODE: "live" },
        ctx,
      ),
    ).rejects.toThrow(/SEND_MODE/);
    expect(await judgments().listRuns({ limit: 10 })).toHaveLength(0);
  });
});
