import { detectChanges, type PostJudgmentChange } from "../domain/diff";
import { startsOnJstDate } from "../domain/jstDate";
import type { CalendarSource } from "../ports/CalendarSource";
import type { ChangeAckRepository } from "../ports/ChangeAckRepository";
import type { Clock } from "../ports/Clock";
import type { JudgmentRepository, JudgmentRun } from "../ports/JudgmentRepository";

export interface ChangeDeps {
  calendar: CalendarSource;
  judgments: JudgmentRepository;
  acks: ChangeAckRepository;
  clock: Clock;
}

export interface ChangeRow extends PostJudgmentChange {
  acked: boolean;
}

export type ChangesView =
  | { date: string; judged: false }
  | { date: string; judged: true; latestRun: JudgmentRun; changes: ChangeRow[] };

export class UnknownChangeError extends Error {
  override name = "UnknownChangeError";
}

/**
 * 最新の成功した判定時点のスナップショットと現在のカレンダーを比べ、判定後の 追加 / 変更 / 削除 を返す。
 * 自動で再判定・再送はしない（管理者が確認する）。
 */
export async function detectPostJudgmentChanges(deps: ChangeDeps, date: string): Promise<ChangesView> {
  const latestRun = (await deps.judgments.listRuns({ targetDate: date, limit: 20 })).find((r) => r.status === "success");
  if (!latestRun) return { date, judged: false };

  const [snapshot, current, acked] = await Promise.all([
    deps.judgments.listItems(date),
    deps.calendar.listEvents(date),
    deps.acks.listAckedFingerprints(date),
  ]);
  const changes = detectChanges(
    snapshot.map((i) => i.event),
    current.filter((e) => startsOnJstDate(e, date)),
  );
  return { date, judged: true, latestRun, changes: changes.map((c) => ({ ...c, acked: acked.has(c.fingerprint) })) };
}

/** 現在の差分に存在する変更だけを確認済みにできる（任意の値を記録させない） */
export async function acknowledgeChange(deps: ChangeDeps, date: string, fingerprint: string): Promise<void> {
  const view = await detectPostJudgmentChanges(deps, date);
  const change = view.judged ? view.changes.find((c) => c.fingerprint === fingerprint) : undefined;
  if (!change) throw new UnknownChangeError("指定された変更は現在の差分にありません");
  await deps.acks.ack(date, change, deps.clock.now());
}

/** 未確認の変更数（ダッシュボード用） */
export function unackedCount(view: ChangesView): number {
  return view.judged ? view.changes.filter((c) => !c.acked).length : 0;
}
