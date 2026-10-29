import type { DisplayNameChange } from "../domain/displayName";
import type { Customer } from "../domain/types";

export interface DisplayNameHistoryEntry {
  karteNo: string;
  displayName: string;
  validFrom: string;
  /** 現行表示名は null */
  validTo: string | null;
}

export class KarteNoConflictError extends Error {
  override name = "KarteNoConflictError";
}

/**
 * 顧客マスタの保存先。初期は D1、将来はサロンカルテ連携の実装に差し替える。
 * 物理削除の操作は持たない（論理削除は status=inactive で save する）。
 */
export interface CustomerRepository {
  /** 論理削除済みを含む全顧客（カルテ番号順） */
  listAll(): Promise<Customer[]>;
  find(karteNo: string): Promise<Customer | undefined>;
  /** 論理削除済みを含む最大カルテ番号。顧客がいなければ null */
  maxKarteNo(): Promise<string | null>;
  listDisplayNameHistory(karteNo?: string): Promise<DisplayNameHistoryEntry[]>;
  /**
   * 顧客の追加/更新と表示名履歴の更新を1トランザクションで適用する。
   * 新規追加でカルテ番号が既に存在する場合は KarteNoConflictError。
   */
  save(
    customer: Customer,
    options: { isNew: boolean; displayNameChanges: readonly DisplayNameChange[]; at: Date },
  ): Promise<void>;
}
