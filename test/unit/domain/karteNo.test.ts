import { describe, expect, it } from "vitest";
import {
  formatKarteNo,
  isNearKarteNoLimit,
  isValidKarteNo,
  KarteNoExhaustedError,
  nextKarteNo,
} from "../../../src/domain/karteNo";

describe("isValidKarteNo", () => {
  it.each(["0001", "0058", "9999"])("%s は有効", (v) => expect(isValidKarteNo(v)).toBe(true));
  it.each(["0000", "1", "001", "00001", "１２３４", "12a4", ""])("%j は無効", (v) =>
    expect(isValidKarteNo(v)).toBe(false),
  );
});

describe("nextKarteNo", () => {
  it("最初の顧客は 0001", () => expect(nextKarteNo(null)).toBe("0001"));
  it("先頭の0を保持して次番号を返す", () => {
    expect(nextKarteNo("0009")).toBe("0010");
    expect(nextKarteNo("0099")).toBe("0100");
  });
  it("9999 の次は採番できない", () => {
    expect(nextKarteNo("9998")).toBe("9999");
    expect(() => nextKarteNo("9999")).toThrow(KarteNoExhaustedError);
  });
  it("不正な既存番号は拒否する", () => expect(() => nextKarteNo("abc")).toThrow(RangeError));
});

describe("formatKarteNo", () => {
  it("4桁ゼロ埋め", () => expect(formatKarteNo(58)).toBe("0058"));
  it.each([0, 10000, 1.5])("%s は範囲外", (n) => expect(() => formatKarteNo(n)).toThrow(RangeError));
});

describe("isNearKarteNoLimit", () => {
  it("9900 を超えると警告", () => {
    expect(isNearKarteNoLimit(null)).toBe(false);
    expect(isNearKarteNoLimit("9900")).toBe(false);
    expect(isNearKarteNoLimit("9901")).toBe(true);
  });
});
