import { normalizeText } from "./normalize";
import type { Customer } from "./types";

export const HONORIFIC = "様";

type NameSource = Pick<Customer, "karteNo" | "familyName" | "givenName">;

/** 名の1文字目（サロゲートペアの漢字も1文字として扱う） */
function givenInitial(givenName: string): string | undefined {
  return Array.from(normalizeText(givenName))[0];
}

/** 単一顧客の表示名を組み立てる。withInitial は同姓がいる場合に true。 */
export function formatDisplayName(customer: NameSource, withInitial: boolean): string {
  const family = normalizeText(customer.familyName);
  const initial = withInitial ? givenInitial(customer.givenName) : undefined;
  return `${family}${initial ? `(${initial})` : ""}${HONORIFIC}（${customer.karteNo}）`;
}

/**
 * 有効な顧客全員の表示名を計算する（表示名生成の唯一の入口）。
 * - 同姓（NFKC 正規化・空白除去後の完全一致）がいなければ「田中様（0001）」
 * - 同姓がいれば既存顧客も含め全員「田中(友)様（0058）」
 * - 頭文字も重複する場合の追加ルールは設けず、カルテ番号で区別する
 * 論理削除済み（inactive）の顧客は同姓判定にも結果にも含めない。
 */
export function computeDisplayNames(
  customers: readonly (NameSource & Pick<Customer, "status">)[],
): Map<string, string> {
  const active = customers.filter((c) => c.status === "active");
  const surnameCount = new Map<string, number>();
  for (const c of active) {
    const key = normalizeText(c.familyName);
    surnameCount.set(key, (surnameCount.get(key) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const c of active) {
    const duplicated = (surnameCount.get(normalizeText(c.familyName)) ?? 0) > 1;
    result.set(c.karteNo, formatDisplayName(c, duplicated));
  }
  return result;
}

export interface DisplayNameChange {
  karteNo: string;
  /** 新規に表示名が付いた場合は null */
  before: string | null;
  /** 表示名が無くなった（論理削除された）場合は null */
  after: string | null;
}

/** 顧客の登録・編集・削除の前後で表示名が変わる顧客を列挙する（影響プレビューと履歴更新に使う） */
export function diffDisplayNames(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): DisplayNameChange[] {
  const karteNos = new Set([...before.keys(), ...after.keys()]);
  const changes: DisplayNameChange[] = [];
  for (const karteNo of [...karteNos].sort()) {
    const b = before.get(karteNo) ?? null;
    const a = after.get(karteNo) ?? null;
    if (b !== a) changes.push({ karteNo, before: b, after: a });
  }
  return changes;
}
