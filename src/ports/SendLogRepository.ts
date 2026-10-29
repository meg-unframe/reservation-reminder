import type { ReminderMessage } from "./ReminderSender";

export interface SendLog extends ReminderMessage {
  id: number;
  mode: "simulation";
  status: "simulated" | "failed";
  retryKey: string;
  createdAt: string;
}

export interface SendLogRepository {
  /** 同じ（対象日・予定ID・開始日時）が未記録なら記録して true、記録済みなら何もせず false */
  insertIfAbsent(message: ReminderMessage, record: { retryKey: string; at: Date }): Promise<boolean>;
  /** JST の年月（YYYY-MM）内の送信数（月200通の無料枠の監視用） */
  countInJstMonth(monthKey: string): Promise<number>;
  list(options: { targetDate?: string; limit: number }): Promise<SendLog[]>;
}
