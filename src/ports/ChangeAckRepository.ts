import type { ChangeKind } from "../domain/diff";

export interface ChangeAckRepository {
  /** 指定日で「確認済み」にした変更の fingerprint */
  listAckedFingerprints(targetDate: string): Promise<Set<string>>;
  /** 確認済みにする（同じ fingerprint は1回だけ記録） */
  ack(targetDate: string, change: { eventId: string; kind: ChangeKind; fingerprint: string }, at: Date): Promise<void>;
}
