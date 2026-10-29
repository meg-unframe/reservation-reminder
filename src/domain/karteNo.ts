export const KARTE_NO_MAX = 9999;
/** この番号を超えたら管理画面で上限警告を出す */
export const KARTE_NO_WARNING_THRESHOLD = 9900;

const KARTE_NO_PATTERN = /^\d{4}$/;

export class KarteNoExhaustedError extends Error {
  override name = "KarteNoExhaustedError";
}

/** 4桁数字かつ 0000 以外 */
export function isValidKarteNo(value: string): boolean {
  return KARTE_NO_PATTERN.test(value) && value !== "0000";
}

export function formatKarteNo(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > KARTE_NO_MAX) {
    throw new RangeError(`カルテ番号の範囲外です: ${n}`);
  }
  return String(n).padStart(4, "0");
}

/**
 * 既存の最大番号の次を採番する。番号は物理削除されないため、最大値+1 なら欠番は再利用されない。
 * @param maxExisting 既存の最大カルテ番号（論理削除済みを含む）。顧客が1人もいなければ null
 */
export function nextKarteNo(maxExisting: string | null): string {
  if (maxExisting === null) return formatKarteNo(1);
  if (!isValidKarteNo(maxExisting)) {
    throw new RangeError(`不正なカルテ番号です: ${maxExisting}`);
  }
  const next = Number(maxExisting) + 1;
  if (next > KARTE_NO_MAX) {
    throw new KarteNoExhaustedError("カルテ番号が上限（9999）に達しました");
  }
  return formatKarteNo(next);
}

export function isNearKarteNoLimit(maxExisting: string | null): boolean {
  return maxExisting !== null && Number(maxExisting) > KARTE_NO_WARNING_THRESHOLD;
}
