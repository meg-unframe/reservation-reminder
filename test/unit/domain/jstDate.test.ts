import { describe, expect, it } from "vitest";
import {
  addDays,
  isValidDateString,
  jstDayRange,
  tomorrowInJst,
  toJstDateString,
  toJstMonthKey,
  toJstParts,
} from "../../../src/domain/jstDate";

describe("tomorrowInJst", () => {
  it("cron 実行時刻 09:00 UTC（=18:00 JST）から翌日を求める", () => {
    expect(tomorrowInJst(new Date("2026-10-29T09:00:00Z"))).toBe("2026-10-30");
  });

  it("UTC では前日でも JST の日付で判断する", () => {
    // 2026-10-29 23:30 UTC = 2026-10-30 08:30 JST
    expect(tomorrowInJst(new Date("2026-10-29T23:30:00Z"))).toBe("2026-10-31");
    // 2026-10-29 14:59 UTC = 23:59 JST / 15:00 UTC = 翌 00:00 JST
    expect(toJstDateString(new Date("2026-10-29T14:59:59Z"))).toBe("2026-10-29");
    expect(toJstDateString(new Date("2026-10-29T15:00:00Z"))).toBe("2026-10-30");
  });

  it.each([
    ["2026-10-31T09:00:00Z", "2026-11-01"], // 月末
    ["2026-12-31T09:00:00Z", "2027-01-01"], // 年末
    ["2028-02-28T09:00:00Z", "2028-02-29"], // うるう年
    ["2027-02-28T09:00:00Z", "2027-03-01"],
  ])("境界: %s → %s", (now, expected) => {
    expect(tomorrowInJst(new Date(now))).toBe(expected);
  });
});

describe("jstDayRange", () => {
  it("JST の 0:00〜翌 0:00 を返す", () => {
    expect(jstDayRange("2026-12-31")).toEqual({
      timeMin: "2026-12-31T00:00:00+09:00",
      timeMax: "2027-01-01T00:00:00+09:00",
    });
  });
  it("不正な日付は拒否する", () => expect(() => jstDayRange("2026-02-30")).toThrow(RangeError));
});

describe("isValidDateString / addDays", () => {
  it.each(["2026-10-30", "2028-02-29"])("%s は有効", (d) => expect(isValidDateString(d)).toBe(true));
  it.each(["2026-02-29", "2026-13-01", "2026/10/30", "20261030", ""])("%j は無効", (d) =>
    expect(isValidDateString(d)).toBe(false),
  );
  it("日数を加減算する", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("toJstMonthKey", () => {
  it("JST の月で集計する", () => {
    expect(toJstMonthKey(new Date("2026-10-31T14:59:59Z"))).toBe("2026-10");
    expect(toJstMonthKey(new Date("2026-10-31T15:00:00Z"))).toBe("2026-11");
  });
});

describe("toJstParts", () => {
  it("+09:00 表記を分解する", () => {
    expect(toJstParts("2026-10-30T14:00:00+09:00")).toEqual({ month: 10, day: 30, weekday: "金", time: "14:00" });
  });
  it("UTC 表記も JST に変換する", () => {
    expect(toJstParts("2026-10-31T15:30:00Z")).toEqual({ month: 11, day: 1, weekday: "日", time: "00:30" });
  });
  it("不正な日時は拒否する", () => expect(() => toJstParts("not-a-date")).toThrow(RangeError));
});
