import { describe, expect, it } from "vitest";
import { FixtureCalendarSource } from "../../../src/adapters/fixture/FixtureCalendarSource";
import {
  GoogleAuthError,
  GoogleCalendarHttpError,
  GoogleCalendarResponseError,
  GoogleCalendarSource,
  toCalendarEvent,
} from "../../../src/adapters/google/GoogleCalendarSource";
import { StaticAccessTokenProvider } from "../../../src/adapters/google/StaticAccessTokenProvider";
import { NonRetryableError } from "../../../src/lib/retry";
import {
  fakeGoogleFetch,
  googleEventsFromFixture,
  TEST_CALENDAR_ID,
  TEST_TOKEN,
} from "../../helpers/fakeGoogleCalendar";

const DATE = "2026-10-30";

function source(fetch: ReturnType<typeof fakeGoogleFetch>["fetch"]) {
  return new GoogleCalendarSource({ calendarId: TEST_CALENDAR_ID, tokens: new StaticAccessTokenProvider(TEST_TOKEN), fetch });
}

describe("GoogleCalendarSource（偽の API 応答）", () => {
  it("読み取り専用の予定一覧 API を、JST の1日分・必要な項目だけで呼ぶ", async () => {
    const fake = fakeGoogleFetch([[]]);
    await source(fake.fetch).listEvents(DATE);

    const [req] = fake.requests;
    expect(req!.url.origin + req!.url.pathname).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/test%40group.calendar.google.com/events",
    );
    expect(Object.fromEntries(req!.url.searchParams)).toEqual({
      timeMin: "2026-10-30T00:00:00+09:00",
      timeMax: "2026-10-31T00:00:00+09:00",
      timeZone: "Asia/Tokyo",
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "250",
      fields: "items(id,status,summary,description,start,end,originalStartTime),nextPageToken",
    });
    expect(req!.headers.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("Fixture と同じ架空予定を、Fixture と同じ形に変換する（UTC 表記の日時も JST にそろえる）", async () => {
    const fake = fakeGoogleFetch([googleEventsFromFixture(DATE)]);
    const events = await source(fake.fetch).listEvents(DATE);

    const expected = (await new FixtureCalendarSource().listEvents(DATE)).map((e) => ({
      ...e,
      eventId: e.eventId.replace(`-${DATE}`, ""),
    }));
    expect(events).toEqual(expected);
  });

  it("nextPageToken をたどって全ページを取得する", async () => {
    const all = googleEventsFromFixture(DATE);
    const fake = fakeGoogleFetch([all.slice(0, 5), all.slice(5, 9), all.slice(9)]);
    const events = await source(fake.fetch).listEvents(DATE);

    expect(events.map((e) => e.eventId)).toEqual(all.map((e) => e.id));
    expect(fake.requests.map((r) => r.url.searchParams.get("pageToken"))).toEqual([null, "page-1", "page-2"]);
  });

  it("ページが上限を超えたら打ち切ってエラーにする", async () => {
    const fake = fakeGoogleFetch(() => Response.json({ items: [], nextPageToken: "again" }));
    await expect(source(fake.fetch).listEvents(DATE)).rejects.toThrow(GoogleCalendarResponseError);
    expect(fake.requests).toHaveLength(10);
  });

  it.each([401, 403])("HTTP %i は認証エラー（再試行しない）", async (status) => {
    const fake = fakeGoogleFetch(() => new Response("{}", { status }));
    const error = await source(fake.fetch).listEvents(DATE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleAuthError);
    expect(error).toBeInstanceOf(NonRetryableError);
  });

  it.each([429, 500, 503])("HTTP %i は再試行対象のエラー", async (status) => {
    const fake = fakeGoogleFetch(() => new Response("{}", { status }));
    const error = await source(fake.fetch).listEvents(DATE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleCalendarHttpError);
    expect(error).not.toBeInstanceOf(NonRetryableError);
  });

  it("エラーメッセージに応答本文・トークン・カレンダー ID を含めない", async () => {
    const fake = fakeGoogleFetch(() => new Response(JSON.stringify({ error: "田中様 の予定" }), { status: 500 }));
    const error = (await source(fake.fetch).listEvents(DATE).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toMatch(/田中|test-access-token|group\.calendar/);
  });

  it.each([
    ["JSON でない", () => new Response("<html>", { status: 200 })],
    ["items が配列でない", () => Response.json({ items: "x" })],
  ])("応答形式が不正（%s）ならエラー", async (_label, respond) => {
    await expect(source(fakeGoogleFetch(respond).fetch).listEvents(DATE)).rejects.toThrow(GoogleCalendarResponseError);
  });
});

describe("toCalendarEvent", () => {
  it("取消済みで start がない繰り返し予定は originalStartTime を使う", () => {
    expect(
      toCalendarEvent({
        id: "r1_20261030T010000Z",
        status: "cancelled",
        originalStartTime: { dateTime: "2026-10-30T10:00:00+09:00" },
      }),
    ).toEqual({
      eventId: "r1_20261030T010000Z",
      cancelled: true,
      allDay: false,
      title: "",
      description: "",
      startAt: "2026-10-30T10:00:00+09:00",
      endAt: "2026-10-30T10:00:00+09:00",
    });
  });

  it.each([
    ["ID がない", { status: "confirmed", start: { dateTime: "2026-10-30T10:00:00+09:00" } }],
    ["時刻がわからない取消", { id: "c1", status: "cancelled" }],
    ["日時が不正", { id: "b1", status: "confirmed", start: { dateTime: "invalid" } }],
  ])("%s予定は除く", (_label, item) => {
    expect(toCalendarEvent(item)).toBeUndefined();
  });
});
