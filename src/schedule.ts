import type { JudgmentTrigger } from "./ports/JudgmentRepository";

/** 18:00 JST の本判定と、その10分後の保険実行（wrangler.toml の crons と一致させる） */
export const CRON_PRIMARY = "0 9 * * *";
export const CRON_RETRY = "10 9 * * *";

export function triggerOfCron(cron: string): JudgmentTrigger {
  if (cron === CRON_PRIMARY) return "cron";
  if (cron === CRON_RETRY) return "cron_retry";
  throw new Error(`未知の cron 式です: ${cron}`);
}
