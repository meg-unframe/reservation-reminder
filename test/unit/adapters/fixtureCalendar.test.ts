import { describe, expect, it } from "vitest";
import { FixtureCalendarSource } from "../../../src/adapters/fixture/FixtureCalendarSource";

describe("FixtureCalendarSource", () => {
  it("テンプレートを指定日の JST 時刻に展開する", async () => {
    const source = new FixtureCalendarSource([
      { id: "a", time: "23:30", minutes: 60, title: "田中様（0001）", description: "" },
      { id: "b", allDay: true, title: "棚卸し", description: "" },
      { id: "c", time: "10:00", minutes: 30, title: "佐藤様（0002）", description: "", cancelled: true },
    ]);
    expect(await source.listEvents("2026-12-31")).toEqual([
      {
        eventId: "a-2026-12-31",
        cancelled: false,
        allDay: false,
        title: "田中様（0001）",
        description: "",
        startAt: "2026-12-31T23:30:00+09:00",
        endAt: "2027-01-01T00:30:00+09:00",
      },
      { eventId: "b-2026-12-31", cancelled: false, allDay: true, title: "棚卸し", description: "", startAt: "2026-12-31", endAt: "2027-01-01" },
      expect.objectContaining({ eventId: "c-2026-12-31", cancelled: true, startAt: "2026-12-31T10:00:00+09:00" }),
    ]);
  });

  it("日付ごとに予定IDが変わる", async () => {
    const source = new FixtureCalendarSource();
    const [a] = await source.listEvents("2026-10-30");
    const [b] = await source.listEvents("2026-10-31");
    expect(a!.eventId).not.toBe(b!.eventId);
  });
});
