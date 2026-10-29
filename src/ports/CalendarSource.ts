import type { CalendarEvent } from "../domain/types";

/** 予約の取得元。初期は Fixture（架空予定）、ステップ7で Google テスト用カレンダーを追加する。 */
export interface CalendarSource {
  /** 指定日（JST）にかかる予定を、キャンセル済みも含めて返す */
  listEvents(date: string): Promise<CalendarEvent[]>;
}
