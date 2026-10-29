import { loadConfig, type Env } from "./config";
import { createJudgmentDeps } from "./container";
import { tomorrowInJst } from "./domain/jstDate";
import { triggerOfCron } from "./schedule";
import { runDailyJudgment } from "./usecases/runDailyJudgment";
import { createApp } from "./web/app";

const app = createApp();

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
