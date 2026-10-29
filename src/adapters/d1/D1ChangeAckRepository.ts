import type { ChangeKind } from "../../domain/diff";
import type { ChangeAckRepository } from "../../ports/ChangeAckRepository";

export class D1ChangeAckRepository implements ChangeAckRepository {
  constructor(private readonly db: D1Database) {}

  async listAckedFingerprints(targetDate: string): Promise<Set<string>> {
    const { results } = await this.db
      .prepare("SELECT fingerprint FROM change_acks WHERE target_date = ?")
      .bind(targetDate)
      .all<{ fingerprint: string }>();
    return new Set(results.map((r) => r.fingerprint));
  }

  async ack(
    targetDate: string,
    { eventId, kind, fingerprint }: { eventId: string; kind: ChangeKind; fingerprint: string },
    at: Date,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO change_acks (target_date, event_id, kind, fingerprint, acked_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (target_date, fingerprint) DO NOTHING`,
      )
      .bind(targetDate, eventId, kind, fingerprint, at.toISOString())
      .run();
  }
}
