import { jstMonthRangeUtc } from "../../domain/jstDate";
import type { ReminderMessage } from "../../ports/ReminderSender";
import type { SendLog, SendLogRepository } from "../../ports/SendLogRepository";

interface SendLogRow {
  id: number;
  target_date: string;
  event_id: string;
  start_at: string;
  karte_no: string;
  body: string;
  mode: "simulation";
  status: "simulated" | "failed";
  retry_key: string;
  run_id: number;
  created_at: string;
}

const COLUMNS = "id, target_date, event_id, start_at, karte_no, body, mode, status, retry_key, run_id, created_at";

export class D1SendLogRepository implements SendLogRepository {
  constructor(private readonly db: D1Database) {}

  async insertIfAbsent(m: ReminderMessage, { retryKey, at }: { retryKey: string; at: Date }): Promise<boolean> {
    // UNIQUE(target_date, event_id, start_at) により、同じ予約への二重記録を DB で防ぐ
    const result = await this.db
      .prepare(
        `INSERT INTO send_logs (target_date, event_id, start_at, karte_no, body, mode, status, retry_key, run_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'simulation', 'simulated', ?, ?, ?)
         ON CONFLICT (target_date, event_id, start_at) DO NOTHING`,
      )
      .bind(m.targetDate, m.eventId, m.startAt, m.karteNo, m.body, retryKey, m.runId, at.toISOString())
      .run();
    return result.meta.changes === 1;
  }

  async countInJstMonth(monthKey: string): Promise<number> {
    const { from, to } = jstMonthRangeUtc(monthKey);
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n FROM send_logs WHERE created_at >= ? AND created_at < ?")
      .bind(from, to)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async list({ targetDate, monthKey, limit }: { targetDate?: string; monthKey?: string; limit: number }): Promise<SendLog[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (targetDate) {
      where.push("target_date = ?");
      params.push(targetDate);
    }
    if (monthKey) {
      const { from, to } = jstMonthRangeUtc(monthKey);
      where.push("created_at >= ? AND created_at < ?");
      params.push(from, to);
    }
    const sql = `SELECT ${COLUMNS} FROM send_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`;
    const { results } = await this.db.prepare(sql).bind(...params, limit).all<SendLogRow>();
    return results.map((r) => ({
      id: r.id,
      targetDate: r.target_date,
      eventId: r.event_id,
      startAt: r.start_at,
      karteNo: r.karte_no,
      body: r.body,
      mode: r.mode,
      status: r.status,
      retryKey: r.retry_key,
      runId: r.run_id,
      createdAt: r.created_at,
    }));
  }
}
