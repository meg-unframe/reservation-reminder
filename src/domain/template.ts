import { HONORIFIC } from "./displayName";
import { toJstParts } from "./jstDate";
import { normalizeText } from "./normalize";

export interface ReminderInput {
  familyName: string;
  /** 予約開始の ISO 8601 日時 */
  startAt: string;
  menu?: string;
}

/**
 * 顧客向けリマインダー本文。宛名は「{姓}様」とし、
 * 管理用の頭文字・カルテ番号は顧客に見せないため含めない。
 */
export function buildReminderMessage({ familyName, startAt, menu }: ReminderInput): string {
  const { month, day, weekday, time } = toJstParts(startAt);
  const what = menu ? `${menu}の` : "";
  return `${normalizeText(familyName)}${HONORIFIC} 明日${month}月${day}日（${weekday}）${time}〜 ${what}ご予約を承っております。`;
}
