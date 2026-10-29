import type { Judgment } from "../domain/classify";
import type { CalendarEvent } from "../domain/types";

export type JudgmentTrigger = "cron" | "cron_retry" | "manual";
export type JudgmentRunStatus = "running" | "success" | "failed";

export interface JudgmentRun {
  id: number;
  targetDate: string;
  trigger: JudgmentTrigger;
  status: JudgmentRunStatus;
  errorCode: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** 判定時点の予定と判定結果（スナップショットの1行） */
export interface JudgmentItem extends Judgment {
  event: Omit<CalendarEvent, "description">;
}

export interface JudgmentRepository {
  startRun(targetDate: string, trigger: JudgmentTrigger, at: Date): Promise<number>;
  finishRun(runId: number, result: { status: "success" } | { status: "failed"; errorCode: string }, at: Date): Promise<void>;
  /** 定時（cron / cron_retry）で成功した判定。手動判定は含めない */
  findScheduledSuccess(targetDate: string): Promise<JudgmentRun | undefined>;
  listRuns(options: { targetDate?: string; limit: number }): Promise<JudgmentRun[]>;
  /** 指定日のスナップショットを丸ごと置き換える（1トランザクション） */
  replaceItems(targetDate: string, runId: number, items: readonly JudgmentItem[]): Promise<void>;
  listItems(targetDate: string): Promise<JudgmentItem[]>;
}
