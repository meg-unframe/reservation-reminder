import { describe, expect, it } from "vitest";
import { classifyEvent, parseMenu, type CustomerLookup, type CustomerLookupEntry } from "../../../src/domain/classify";
import type { CalendarEvent } from "../../../src/domain/types";

// 架空の顧客
const customers: Record<string, CustomerLookupEntry> = {
  "0001": { status: "active", familyName: "田中", currentDisplayName: "田中(花)様（0001）", pastDisplayNames: ["田中様（0001）"] },
  "0058": { status: "active", familyName: "田中", currentDisplayName: "田中(友)様（0058）", pastDisplayNames: [] },
  "0003": { status: "inactive", familyName: "佐藤", currentDisplayName: null, pastDisplayNames: ["佐藤様（0003）"] },
};
const lookup: CustomerLookup = (no) => customers[no];

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    eventId: "evt-1",
    cancelled: false,
    allDay: false,
    title: "田中(友)様（0058）",
    description: "",
    startAt: "2026-10-30T14:00:00+09:00",
    endAt: "2026-10-30T15:00:00+09:00",
    ...overrides,
  };
}

describe("classifyEvent", () => {
  it("現行表示名と一致すれば通知対象", () => {
    expect(classifyEvent(event({}), lookup)).toEqual({ result: "notify", reason: "matched", karteNo: "0058" });
  });

  it("全角/半角が揺れていても一致すれば通知対象", () => {
    expect(classifyEvent(event({ title: "田中（友）様(００５８)" }), lookup).result).toBe("notify");
  });

  it("旧表示名と一致すれば警告付きで通知対象", () => {
    expect(classifyEvent(event({ title: "田中様（0001）" }), lookup)).toEqual({
      result: "notify",
      reason: "matched_past_name",
      warning: "title_outdated",
      karteNo: "0001",
    });
  });

  it("番号はあるが名前部分が違えば要確認（番号の打ち間違い対策）", () => {
    expect(classifyEvent(event({ title: "田中(友)様（0001）" }), lookup)).toMatchObject({ result: "review", reason: "name_mismatch" });
  });

  it("敬称が「さん」なら要確認", () => {
    expect(classifyEvent(event({ title: "田中(友)さん（0058）" }), lookup)).toMatchObject({ result: "review", reason: "name_mismatch" });
  });

  it("未登録の番号は要確認", () => {
    expect(classifyEvent(event({ title: "鈴木様（0999）" }), lookup)).toMatchObject({ result: "review", reason: "unknown_karte_no", karteNo: "0999" });
  });

  it("論理削除済みの顧客は旧表示名と一致しても要確認", () => {
    expect(classifyEvent(event({ title: "佐藤様（0003）" }), lookup)).toMatchObject({ result: "review", reason: "inactive_customer" });
  });

  it.each([
    [{ cancelled: true }, "cancelled"],
    [{ allDay: true, startAt: "2026-10-30", endAt: "2026-10-31" }, "all_day"],
    [{ title: "歯医者" }, "not_reservation"],
  ] as const)("対象外: %j → %s", (overrides, reason) => {
    expect(classifyEvent(event(overrides), lookup)).toEqual({ result: "excluded", reason });
  });

  it("説明欄のメニューを取り出す", () => {
    expect(classifyEvent(event({ description: "メニュー: カット" }), lookup).menu).toBe("カット");
  });
});

describe("parseMenu", () => {
  it.each([
    ["メニュー: カット", "カット"],
    ["メニュー：カラー＋カット", "カラー+カット"],
    ["　メニュー　：　パーマ　", "パーマ"],
    ["メモ: 初回\nメニュー: カット", "カット"],
    ["メモ<br>メニュー: <b>ネイル</b>", "ネイル"],
  ])("%j → %j", (description, menu) => {
    expect(parseMenu(description)).toBe(menu);
  });

  it.each(["", "カット", "メニュー:", "メニュー:   "])("メニューなし: %j", (description) => {
    expect(parseMenu(description)).toBeUndefined();
  });

  it("50文字に切り詰める", () => {
    expect(parseMenu(`メニュー: ${"あ".repeat(80)}`)).toHaveLength(50);
  });
});
