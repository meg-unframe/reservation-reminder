import { jstDayRange, toJstIsoString } from "../../domain/jstDate";
import type { CalendarEvent } from "../../domain/types";
import { guardedFetch } from "../../lib/egress";
import { NonRetryableError } from "../../lib/retry";
import type { AccessTokenProvider } from "../../ports/AccessTokenProvider";
import type { CalendarSource } from "../../ports/CalendarSource";

const API_BASE = "https://www.googleapis.com/calendar/v3/calendars";
// 判定に必要な項目だけを取得する（参加者・作成者のメールアドレスなどは受け取らない）
const FIELDS = "items(id,status,summary,description,start,end,originalStartTime),nextPageToken";
const PAGE_SIZE = 250;
/** 月200件規模で1日に数ページを超えることはない。想定外の応答で無限に取得し続けないための上限 */
const MAX_PAGES = 10;
const TIMEOUT_MS = 10_000;

/** 認証・権限のエラー（トークン期限切れ、カレンダー未共有など）。再試行しても直らない */
export class GoogleAuthError extends NonRetryableError {
  override name = "GoogleAuthError";
}

/** それ以外の HTTP エラー（429・5xx など）。再試行の対象 */
export class GoogleCalendarHttpError extends Error {
  override name = "GoogleCalendarHttpError";
}

/** 応答の形式が想定外 */
export class GoogleCalendarResponseError extends NonRetryableError {
  override name = "GoogleCalendarResponseError";
}

interface GoogleEventTime {
  date?: string;
  dateTime?: string;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  originalStartTime?: GoogleEventTime;
}

interface GoogleEventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

export interface GoogleCalendarSourceOptions {
  calendarId: string;
  tokens: AccessTokenProvider;
  /** テストで差し替える。既定は許可リスト付きの guardedFetch */
  fetch?: typeof guardedFetch;
}

/** Google カレンダー（テスト用カレンダー）の予定を読み取り専用で取得する */
export class GoogleCalendarSource implements CalendarSource {
  private readonly calendarId: string;
  private readonly tokens: AccessTokenProvider;
  private readonly fetch: typeof guardedFetch;

  constructor(options: GoogleCalendarSourceOptions) {
    this.calendarId = options.calendarId;
    this.tokens = options.tokens;
    this.fetch = options.fetch ?? guardedFetch;
  }

  async listEvents(date: string): Promise<CalendarEvent[]> {
    const { timeMin, timeMax } = jstDayRange(date);
    const token = await this.tokens.getAccessToken();
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.fetchPage({ timeMin, timeMax, token, pageToken });
      for (const item of result.items ?? []) {
        const event = toCalendarEvent(item);
        if (event) events.push(event);
      }
      pageToken = result.nextPageToken;
      if (!pageToken) return events;
    }
    throw new GoogleCalendarResponseError(`ページ数が上限（${MAX_PAGES}）を超えました`);
  }

  private async fetchPage(params: {
    timeMin: string;
    timeMax: string;
    token: string;
    pageToken: string | undefined;
  }): Promise<GoogleEventsPage> {
    const url = new URL(`${API_BASE}/${encodeURIComponent(this.calendarId)}/events`);
    url.search = new URLSearchParams({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      timeZone: "Asia/Tokyo",
      singleEvents: "true", // 繰り返し予定を個別の予定に展開する
      showDeleted: "true", // キャンセルされた予定も取得し、判定後の変更検知に使う
      maxResults: String(PAGE_SIZE),
      fields: FIELDS,
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    }).toString();

    const res = await this.fetch(url, {
      headers: { Authorization: `Bearer ${params.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // エラーメッセージには状態コードだけを入れる（応答本文やカレンダー ID は含めない）
    if (res.status === 401 || res.status === 403) {
      throw new GoogleAuthError(`Google カレンダー API の認証に失敗しました（HTTP ${res.status}）`);
    }
    if (!res.ok) throw new GoogleCalendarHttpError(`Google カレンダー API がエラーを返しました（HTTP ${res.status}）`);

    const body: unknown = await res.json().catch(() => undefined);
    if (!isEventsPage(body)) throw new GoogleCalendarResponseError("予定一覧の応答形式が不正です");
    return body;
  }
}

function isEventsPage(value: unknown): value is GoogleEventsPage {
  if (typeof value !== "object" || value === null) return false;
  const { items, nextPageToken } = value as Record<string, unknown>;
  return (
    (items === undefined || (Array.isArray(items) && items.every((i) => typeof i === "object" && i !== null))) &&
    (nextPageToken === undefined || typeof nextPageToken === "string")
  );
}

/** Google の予定をドメインの型に変換する。時刻がわからないもの（ID なし・時刻なしの取消）は除く */
export function toCalendarEvent(item: GoogleEvent): CalendarEvent | undefined {
  if (!item.id) return undefined;
  const cancelled = item.status === "cancelled";
  // 取消済みの繰り返し予定は start を持たず、originalStartTime だけを持つことがある
  const start = item.start ?? (cancelled ? item.originalStartTime : undefined);
  if (!start) return undefined;
  const end = item.end ?? start;
  const base = { eventId: item.id, cancelled, title: item.summary ?? "", description: item.description ?? "" };

  if (start.date) {
    return { ...base, allDay: true, startAt: start.date, endAt: end.date ?? start.date };
  }
  const startAt = normalizeDateTime(start.dateTime);
  const endAt = normalizeDateTime(end.dateTime) ?? startAt;
  if (!startAt || !endAt) return undefined;
  return { ...base, allDay: false, startAt, endAt };
}

/** 日時を JST（+09:00）の表記にそろえる（Fixture と同じ形式） */
function normalizeDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : toJstIsoString(new Date(ms));
}
