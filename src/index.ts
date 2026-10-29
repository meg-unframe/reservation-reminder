import { Hono } from "hono";
import { loadConfig, type AppConfig, type Env } from "./config";
import { createCustomerDeps, createJudgmentDeps } from "./container";
import { tomorrowInJst } from "./domain/jstDate";
import { triggerOfCron } from "./schedule";
import { runDailyJudgment } from "./usecases/runDailyJudgment";
import { seedFixtureCustomers } from "./usecases/seedFixtureCustomers";

const app = new Hono<{ Bindings: Env; Variables: { config: AppConfig } }>();

// 設定が不正なら全リクエストを拒否する（送信モードの安全装置）
app.use(async (c, next) => {
  c.set("config", loadConfig(c.env));
  await next();
});

app.get("/healthz", (c) => c.json({ ok: true, sendMode: "simulation" }));

// ローカル開発専用: 架空顧客の投入
app.post("/dev/seed", async (c) => {
  if (c.var.config.environment !== "local") return c.notFound();
  return c.json(await seedFixtureCustomers(createCustomerDeps(c.env)));
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env, _ctx) {
    const config = loadConfig(env);
    await runDailyJudgment(createJudgmentDeps(env, config), {
      targetDate: tomorrowInJst(new Date(controller.scheduledTime)),
      trigger: triggerOfCron(controller.cron),
    });
  },
} satisfies ExportedHandler<Env>;
