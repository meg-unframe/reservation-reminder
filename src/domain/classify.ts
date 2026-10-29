import { parseReservationTitle, toDisplayKey } from "./titleParser";
import type { CalendarEvent, CustomerStatus } from "./types";

export type JudgmentResult = "notify" | "review" | "excluded";

export type JudgmentReason =
  | "matched" // 通知対象: 現行表示名と一致
  | "matched_past_name" // 通知対象: 旧表示名と一致（タイトル不一致の警告付き）
  | "unknown_karte_no" // 要確認: 番号が未登録
  | "inactive_customer" // 要確認: 論理削除済みの顧客
  | "name_mismatch" // 要確認: 番号はあるが名前部分（敬称含む）が一致しない
  | "cancelled" // 対象外
  | "all_day" // 対象外
  | "not_reservation"; // 対象外: 番号を含まない私用予定

export type JudgmentWarning = "title_outdated";

export interface Judgment {
  result: JudgmentResult;
  reason: JudgmentReason;
  warning?: JudgmentWarning;
  karteNo?: string;
  menu?: string;
}

/** 判定に必要な顧客情報。現行表示名は有効な顧客のみ持つ。 */
export interface CustomerLookupEntry {
  status: CustomerStatus;
  familyName: string;
  currentDisplayName: string | null;
  pastDisplayNames: readonly string[];
}

export type CustomerLookup = (karteNo: string) => CustomerLookupEntry | undefined;

const MENU_MAX_LENGTH = 50;
// NFKC 後は全角コロン・全角空白も半角になる
const MENU_LINE = /^[^\S\n]*メニュー[^\S\n]*:[^\S\n]*(\S.*?)[^\S\n]*$/m;

/** 説明欄の「メニュー: ○○」を取り出す（全角/半角コロン・Google の HTML 改行に対応） */
export function parseMenu(description: string): string | undefined {
  const text = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .normalize("NFKC");
  const menu = MENU_LINE.exec(text)?.[1];
  return menu ? Array.from(menu).slice(0, MENU_MAX_LENGTH).join("") : undefined;
}

/** 1件の予定を 通知対象 / 要確認 / 対象外 に分類する */
export function classifyEvent(event: CalendarEvent, lookup: CustomerLookup): Judgment {
  if (event.cancelled) return { result: "excluded", reason: "cancelled" };
  if (event.allDay) return { result: "excluded", reason: "all_day" };

  const parsed = parseReservationTitle(event.title);
  if (parsed.kind === "none") return { result: "excluded", reason: "not_reservation" };

  const { karteNo } = parsed;
  const menu = parseMenu(event.description);
  const withMenu = menu === undefined ? {} : { menu };
  const customer = lookup(karteNo);
  if (!customer) return { result: "review", reason: "unknown_karte_no", karteNo, ...withMenu };
  if (customer.status !== "active" || customer.currentDisplayName === null) {
    return { result: "review", reason: "inactive_customer", karteNo, ...withMenu };
  }
  if (parsed.displayKey === toDisplayKey(customer.currentDisplayName)) {
    return { result: "notify", reason: "matched", karteNo, ...withMenu };
  }
  if (customer.pastDisplayNames.some((name) => parsed.displayKey === toDisplayKey(name))) {
    return { result: "notify", reason: "matched_past_name", warning: "title_outdated", karteNo, ...withMenu };
  }
  return { result: "review", reason: "name_mismatch", karteNo, ...withMenu };
}
