import { describe, expect, it } from "vitest";
import { buildReminderMessage } from "../../../src/domain/template";

describe("buildReminderMessage", () => {
  it("メニューありの本文", () => {
    expect(buildReminderMessage({ familyName: "田中", startAt: "2026-10-29T14:00:00+09:00", menu: "カット" })).toBe(
      "田中様 明日10月29日（木）14:00〜 カットのご予約を承っております。",
    );
  });

  it("メニューなしの本文", () => {
    expect(buildReminderMessage({ familyName: "佐藤", startAt: "2026-10-30T09:30:00+09:00" })).toBe(
      "佐藤様 明日10月30日（金）09:30〜 ご予約を承っております。",
    );
  });

  it("宛名は「姓様」で、頭文字・カルテ番号・「さん」を含まない", () => {
    const body = buildReminderMessage({ familyName: " 田中 ", startAt: "2026-10-29T14:00:00+09:00", menu: "カット" });
    expect(body.startsWith("田中様 ")).toBe(true);
    expect(body).not.toMatch(/\d{4}|\(.\)|（\d+）|さん/);
  });
});
