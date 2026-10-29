export type CustomerStatus = "active" | "inactive";

export interface Customer {
  karteNo: string;
  familyName: string;
  givenName: string;
  familyKana: string;
  givenKana: string;
  status: CustomerStatus;
}

/** カレンダー予定をドメインで扱う形に正規化したもの（取得元に依存しない） */
export interface CalendarEvent {
  eventId: string;
  cancelled: boolean;
  allDay: boolean;
  title: string;
  description: string;
  /** 終日予定では日付のみ（YYYY-MM-DD）、それ以外は ISO 8601 日時 */
  startAt: string;
  endAt: string;
}
