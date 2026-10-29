import { normalizeText } from "./normalize";
import { parseReservationTitle } from "./titleParser";
import type { CalendarEvent } from "./types";

/** 差分比較に使う予定の要素（スナップショットと現在のカレンダーで共通） */
export type EventSnapshot = Pick<CalendarEvent, "eventId" | "cancelled" | "allDay" | "title" | "startAt" | "endAt">;

export type ChangeKind = "added" | "changed" | "removed";

export interface PostJudgmentChange {
  kind: ChangeKind;
  eventId: string;
  before?: EventSnapshot;
  after?: EventSnapshot;
  /** 確認済み判定用。同じ予定がさらに変化したら値が変わり、再表示される */
  fingerprint: string;
}

/** 予約らしい予定（カルテ番号付きタイトル・時刻指定・未キャンセル）のみ差分対象にする */
function isLiveReservation(e: EventSnapshot | undefined): e is EventSnapshot {
  return !!e && !e.cancelled && !e.allDay && parseReservationTitle(e.title).kind === "reservation";
}

function sameContent(a: EventSnapshot, b: EventSnapshot): boolean {
  return (
    Date.parse(a.startAt) === Date.parse(b.startAt) &&
    Date.parse(a.endAt) === Date.parse(b.endAt) &&
    normalizeText(a.title) === normalizeText(b.title)
  );
}

function fingerprintOf(kind: ChangeKind, eventId: string, after: EventSnapshot | undefined): string {
  return after ? [kind, eventId, after.startAt, after.endAt, normalizeText(after.title)].join("|") : `${kind}|${eventId}`;
}

/** 18:00 判定時のスナップショットと現在の予定を比べ、判定後の 追加 / 変更 / 削除 を返す */
export function detectChanges(
  snapshot: readonly EventSnapshot[],
  current: readonly EventSnapshot[],
): PostJudgmentChange[] {
  const before = new Map(snapshot.map((e) => [e.eventId, e]));
  const after = new Map(current.map((e) => [e.eventId, e]));
  const changes: PostJudgmentChange[] = [];

  for (const eventId of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(eventId);
    const a = after.get(eventId);
    const wasLive = isLiveReservation(b);
    const isLive = isLiveReservation(a);
    let kind: ChangeKind | undefined;
    if (!wasLive && isLive) kind = "added";
    else if (wasLive && !isLive) kind = "removed";
    else if (wasLive && isLive && !sameContent(b, a)) kind = "changed";
    if (!kind) continue;
    changes.push({
      kind,
      eventId,
      ...(b ? { before: b } : {}),
      ...(a ? { after: a } : {}),
      fingerprint: fingerprintOf(kind, eventId, kind === "removed" ? undefined : a),
    });
  }
  const startOf = (c: PostJudgmentChange) => Date.parse((c.after ?? c.before)!.startAt);
  return changes.sort((x, y) => startOf(x) - startOf(y));
}
