import type { JudgmentReason, JudgmentResult, JudgmentWarning } from "../../domain/classify";
import type {
  JudgmentItem,
  JudgmentRepository,
  JudgmentRun,
  JudgmentRunStatus,
  JudgmentTrigger,
} from "../../ports/JudgmentRepository";

interface RunRow {
  id: number;
  target_date: string;
  trigger: JudgmentTrigger;
  status: JudgmentRunStatus;
  error_code: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ItemRow {
  event_id: string;
  cancelled: number;
  all_day: number;
  title_raw: string;
  start_at: string;
  end_at: string;
  karte_no: string | null;
  result: JudgmentResult;
  reason: JudgmentReason;
  warning: JudgmentWarning | null;
  menu: string | null;
}

function toRun(r: RunRow): JudgmentRun {
  return {
    id: r.id,
    targetDate: r.target_date,
    trigger: r.trigger,
    status: r.status,
    errorCode: r.error_code,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

function toItem(r: ItemRow): JudgmentItem {
  return {
    event: {
      eventId: r.event_id,
      cancelled: r.cancelled === 1,
      allDay: r.all_day === 1,
      title: r.title_raw,
      startAt: r.start_at,
      endAt: r.end_at,
    },
    result: r.result,
    reason: r.reason,
    ...(r.warning ? { warning: r.warning } : {}),
    ...(r.karte_no ? { karteNo: r.karte_no } : {}),
    ...(r.menu ? { menu: r.menu } : {}),
  };
}

const RUN_COLUMNS = "id, target_date, trigger, status, error_code, started_at, finished_at";

export class D1JudgmentRepository implements JudgmentRepository {
  constructor(private readonly db: D1Database) {}

  async startRun(targetDate: string, trigger: JudgmentTrigger, at: Date): Promise<number> {
    const row = await this.db
      .prepare("INSERT INTO judgment_runs (target_date, trigger, status, started_at) VALUES (?, ?, 'running', ?) RETURNING id")
      .bind(targetDate, trigger, at.toISOString())
      .first<{ id: number }>();
    if (!row) throw new Error("judgment_runs の作成に失敗しました");
    return row.id;
  }

  async finishRun(
    runId: number,
    result: { status: "success" } | { status: "failed"; errorCode: string },
    at: Date,
  ): Promise<void> {
    await this.db
      .prepare("UPDATE judgment_runs SET status = ?, error_code = ?, finished_at = ? WHERE id = ?")
      .bind(result.status, result.status === "failed" ? result.errorCode : null, at.toISOString(), runId)
      .run();
  }

  async findScheduledSuccess(targetDate: string): Promise<JudgmentRun | undefined> {
    const row = await this.db
      .prepare(
        `SELECT ${RUN_COLUMNS} FROM judgment_runs
         WHERE target_date = ? AND status = 'success' AND trigger IN ('cron', 'cron_retry')
         ORDER BY id LIMIT 1`,
      )
      .bind(targetDate)
      .first<RunRow>();
    return row ? toRun(row) : undefined;
  }

  async listRuns({ targetDate, limit }: { targetDate?: string; limit: number }): Promise<JudgmentRun[]> {
    const stmt = targetDate
      ? this.db.prepare(`SELECT ${RUN_COLUMNS} FROM judgment_runs WHERE target_date = ? ORDER BY id DESC LIMIT ?`).bind(targetDate, limit)
      : this.db.prepare(`SELECT ${RUN_COLUMNS} FROM judgment_runs ORDER BY id DESC LIMIT ?`).bind(limit);
    const { results } = await stmt.all<RunRow>();
    return results.map(toRun);
  }

  async replaceItems(targetDate: string, runId: number, items: readonly JudgmentItem[]): Promise<void> {
    const statements = [
      this.db.prepare("DELETE FROM judgment_items WHERE target_date = ?").bind(targetDate),
      ...items.map((item) =>
        this.db
          .prepare(
            `INSERT INTO judgment_items
             (target_date, event_id, cancelled, all_day, title_raw, start_at, end_at, karte_no, result, reason, warning, menu, run_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            targetDate,
            item.event.eventId,
            item.event.cancelled ? 1 : 0,
            item.event.allDay ? 1 : 0,
            item.event.title,
            item.event.startAt,
            item.event.endAt,
            item.karteNo ?? null,
            item.result,
            item.reason,
            item.warning ?? null,
            item.menu ?? null,
            runId,
          ),
      ),
    ];
    await this.db.batch(statements);
  }

  async listItems(targetDate: string): Promise<JudgmentItem[]> {
    const { results } = await this.db
      .prepare(
        `SELECT event_id, cancelled, all_day, title_raw, start_at, end_at, karte_no, result, reason, warning, menu
         FROM judgment_items WHERE target_date = ? ORDER BY start_at, event_id`,
      )
      .bind(targetDate)
      .all<ItemRow>();
    return results.map(toItem);
  }
}
