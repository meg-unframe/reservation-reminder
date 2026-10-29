export interface ReminderMessage {
  targetDate: string;
  eventId: string;
  startAt: string;
  karteNo: string;
  body: string;
  runId: number;
}

/** duplicate: 同じ予約（予定ID・開始日時）には既に送信済みのため何もしなかった */
export type SendOutcome = "simulated" | "duplicate";

/**
 * リマインダーの送信先。初期段階の実装は SimulatedSender（DB に記録するだけ）のみ。
 * 実際の送信実装は明示的な許可が出るまで追加しない。
 */
export interface ReminderSender {
  send(message: ReminderMessage): Promise<SendOutcome>;
}
