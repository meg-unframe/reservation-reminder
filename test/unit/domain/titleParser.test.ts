import { describe, expect, it } from "vitest";
import { parseReservationTitle, toDisplayKey } from "../../../src/domain/titleParser";

describe("parseReservationTitle", () => {
  it("通常の表示名を解析する", () => {
    expect(parseReservationTitle("田中様（0001）")).toEqual({ kind: "reservation", karteNo: "0001", displayKey: "田中様(0001)" });
  });

  it("頭文字付きの表示名を解析する", () => {
    expect(parseReservationTitle("田中(友)様（0058）")).toEqual({
      kind: "reservation",
      karteNo: "0058",
      displayKey: "田中(友)様(0058)",
    });
  });

  it.each([
    "田中（友）様（００５８）",
    "田中(友)様(0058)",
    " 田中 (友) 様 （0058） ",
    "田中（友）様(0058)",
  ])("括弧・数字の全角/半角と空白の揺れを吸収する: %j", (title) => {
    const parsed = parseReservationTitle(title);
    expect(parsed).toEqual({ kind: "reservation", karteNo: "0058", displayKey: toDisplayKey("田中(友)様（0058）") });
  });

  it("番号より後ろの文字は無視する", () => {
    const parsed = parseReservationTitle("佐藤様（0002） カット");
    expect(parsed).toMatchObject({ kind: "reservation", karteNo: "0002", displayKey: "佐藤様(0002)" });
  });

  it.each(["歯医者", "会議 (13:00)", "田中様（001）", "田中様（00001）", ""])("4桁番号の括弧がない予定は予約ではない: %j", (title) => {
    expect(parseReservationTitle(title)).toEqual({ kind: "none" });
  });

  it("敬称違いも番号は取り出す（照合で要確認になる）", () => {
    expect(parseReservationTitle("田中さん（0001）")).toMatchObject({ karteNo: "0001", displayKey: "田中さん(0001)" });
  });
});
