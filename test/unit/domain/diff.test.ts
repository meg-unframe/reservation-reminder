import { describe, expect, it } from "vitest";
import { detectChanges, type EventSnapshot } from "../../../src/domain/diff";

function ev(eventId: string, overrides: Partial<EventSnapshot> = {}): EventSnapshot {
  return {
    eventId,
    cancelled: false,
    allDay: false,
    title: "田中様（0001）",
    startAt: "2026-10-30T14:00:00+09:00",
    endAt: "2026-10-30T15:00:00+09:00",
    ...overrides,
  };
}

describe("detectChanges", () => {
  it("変化がなければ空", () => {
    expect(detectChanges([ev("a")], [ev("a")])).toEqual([]);
  });

  it("表記揺れ・タイムゾーン表記の違いは変更とみなさない", () => {
    const current = ev("a", { title: "田中様(0001)", startAt: "2026-10-30T05:00:00Z", endAt: "2026-10-30T06:00:00Z" });
    expect(detectChanges([ev("a")], [current])).toEqual([]);
  });

  it("判定後に追加された予約", () => {
    const added = ev("b", { title: "佐藤様（0002）", startAt: "2026-10-30T10:00:00+09:00" });
    expect(detectChanges([ev("a")], [ev("a"), added])).toEqual([
      { kind: "added", eventId: "b", after: added, fingerprint: expect.stringContaining("added|b|") },
    ]);
  });

  it("時刻・顧客の変更", () => {
    const moved = ev("a", { startAt: "2026-10-30T16:00:00+09:00", endAt: "2026-10-30T17:00:00+09:00" });
    const renamed = ev("c", { title: "佐藤様（0002）" });
    const changes = detectChanges([ev("a"), ev("c")], [moved, renamed]);
    expect(changes.map((c) => [c.kind, c.eventId])).toEqual([
      ["changed", "c"],
      ["changed", "a"],
    ]);
  });

  it("キャンセル・消失・予約でなくなった予定は削除", () => {
    const changes = detectChanges(
      [ev("a"), ev("b"), ev("c")],
      [ev("a", { cancelled: true }), ev("c", { title: "私用" })],
    );
    expect(changes.map((c) => [c.kind, c.eventId])).toEqual([
      ["removed", "a"],
      ["removed", "b"],
      ["removed", "c"],
    ]);
    expect(changes.every((c) => c.before && c.fingerprint === `removed|${c.eventId}`)).toBe(true);
  });

  it("キャンセル済みだった予定が復活したら追加", () => {
    expect(detectChanges([ev("a", { cancelled: true })], [ev("a")]).map((c) => c.kind)).toEqual(["added"]);
  });

  it("私用・終日予定の追加や変化は無視する", () => {
    const changes = detectChanges(
      [ev("p", { title: "歯医者" })],
      [ev("p", { title: "歯医者（変更）" }), ev("q", { allDay: true, startAt: "2026-10-30", endAt: "2026-10-31" })],
    );
    expect(changes).toEqual([]);
  });

  it("同じ予定がさらに変わると fingerprint が変わる（確認済みが解除される）", () => {
    const first = detectChanges([ev("a")], [ev("a", { startAt: "2026-10-30T16:00:00+09:00" })])[0]!;
    const second = detectChanges([ev("a")], [ev("a", { startAt: "2026-10-30T17:00:00+09:00" })])[0]!;
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });
});
