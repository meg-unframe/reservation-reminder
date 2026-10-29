import { normalizeText } from "./normalize";

export type ParsedTitle =
  | {
      kind: "reservation";
      karteNo: string;
      /** 先頭からカルテ番号の閉じ括弧までを正規化したもの。表示名との比較キー */
      displayKey: string;
    }
  | { kind: "none" };

// NFKC 後は （）→() 、全角数字→半角になるため半角だけを扱えばよい
const RESERVATION_TITLE = /^(.*?)\((\d{4})\)/;

/**
 * 予約タイトル「田中(友)様（0058）」を解析する。
 * 4桁番号の括弧を含まない予定は予約ではない（私用）とみなす。番号より後ろの文字は無視する。
 */
export function parseReservationTitle(title: string): ParsedTitle {
  const normalized = normalizeText(title);
  const match = RESERVATION_TITLE.exec(normalized);
  if (!match) return { kind: "none" };
  return { kind: "reservation", karteNo: match[2]!, displayKey: match[0] };
}

/** 表示名をタイトル比較用のキーに変換する */
export function toDisplayKey(displayName: string): string {
  return normalizeText(displayName);
}
