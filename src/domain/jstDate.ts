// 日本は夏時間がないため +09:00 固定で計算する（実行環境のタイムゾーンに依存しない）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD 形式かつ実在する日付か */
export function isValidDateString(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function assertDate(value: string): void {
  if (!isValidDateString(value)) throw new RangeError(`不正な日付です: ${value}`);
}

/** 時刻を JST の日付（YYYY-MM-DD）にする */
export function toJstDateString(instant: Date): string {
  return new Date(instant.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  assertDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 実行時刻から見た JST の翌日 */
export function tomorrowInJst(now: Date): string {
  return addDays(toJstDateString(now), 1);
}

/** 指定日の JST 0:00〜翌日 0:00（Calendar API の timeMin / timeMax 用） */
export function jstDayRange(date: string): { timeMin: string; timeMax: string } {
  assertDate(date);
  return { timeMin: `${date}T00:00:00+09:00`, timeMax: `${addDays(date, 1)}T00:00:00+09:00` };
}

/** JST の年月（YYYY-MM）。月間送信数の集計に使う */
export function toJstMonthKey(instant: Date): string {
  return toJstDateString(instant).slice(0, 7);
}

export interface JstDateTimeParts {
  month: number;
  day: number;
  weekday: (typeof WEEKDAYS)[number];
  /** HH:mm */
  time: string;
}

/** ISO 8601 日時を JST の月・日・曜日・時刻に分解する */
export function toJstParts(isoDateTime: string): JstDateTimeParts {
  const ms = Date.parse(isoDateTime);
  if (Number.isNaN(ms)) throw new RangeError(`不正な日時です: ${isoDateTime}`);
  const jst = new Date(ms + JST_OFFSET_MS);
  return {
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    weekday: WEEKDAYS[jst.getUTCDay()]!,
    time: jst.toISOString().slice(11, 16),
  };
}
