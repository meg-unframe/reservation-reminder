import fixture from "../../fixtures/events.json";
import { addDays } from "../../src/domain/jstDate";

// Google カレンダー API の応答を模したもの。実際の API には接続しない（架空の予定のみ）

export const TEST_CALENDAR_ID = "test@group.calendar.google.com";
export const TEST_TOKEN = "test-access-token";

export interface GoogleEventJson {
  id: string;
  status: "confirmed" | "cancelled";
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  originalStartTime?: { date?: string; dateTime?: string };
}

/** Fixture の架空予定を、Google API が返す形（予定 ID は fx-01 などそのまま）に変換する */
export function googleEventsFromFixture(date: string): GoogleEventJson[] {
  return fixture.events.map((e) => {
    const base = {
      id: e.id,
      status: e.cancelled ? ("cancelled" as const) : ("confirmed" as const),
      summary: e.title,
      ...(e.description ? { description: e.description } : {}),
    };
    if ("allDay" in e && e.allDay) return { ...base, start: { date }, end: { date: addDays(date, 1) } };
    const start = new Date(`${date}T${e.time}:00+09:00`);
    const end = new Date(start.getTime() + e.minutes! * 60_000);
    // Google は timeZone 指定に合わせた表記で返すが、UTC 表記でも同じ結果になることを確かめるため混在させる
    const fmt = (d: Date, utc: boolean) =>
      utc ? d.toISOString() : `${new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 19)}+09:00`;
    const utc = e.id.endsWith("2");
    return { ...base, start: { dateTime: fmt(start, utc), timeZone: "Asia/Tokyo" }, end: { dateTime: fmt(end, utc) } };
  });
}

export interface RecordedRequest {
  url: URL;
  headers: Headers;
}

/**
 * fetch の代わりに使う偽の Google API。pages の順に応答し、要求内容を記録する。
 * 関数を渡すと任意の応答（エラーなど）を返せる。
 */
export function fakeGoogleFetch(responder: GoogleEventJson[][] | ((call: number) => Response)) {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const call = requests.length;
    requests.push({ url: new URL(input), headers: new Headers(init?.headers) });
    if (typeof responder === "function") return responder(call);
    const items = responder[call] ?? [];
    const nextPageToken = call + 1 < responder.length ? `page-${call + 1}` : undefined;
    return Response.json({ items, ...(nextPageToken ? { nextPageToken } : {}) });
  };
  return { fetch, requests };
}
