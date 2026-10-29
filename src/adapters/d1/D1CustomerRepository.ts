import type { DisplayNameChange } from "../../domain/displayName";
import { nextKarteNo } from "../../domain/karteNo";
import type { Customer, CustomerStatus } from "../../domain/types";
import {
  KarteNoConflictError,
  type CustomerRepository,
  type DisplayNameHistoryEntry,
} from "../../ports/CustomerRepository";
import type { KarteNumberAllocator } from "../../ports/KarteNumberAllocator";

interface CustomerRow {
  karte_no: string;
  family_name: string;
  given_name: string;
  family_kana: string;
  given_kana: string;
  status: CustomerStatus;
}

interface HistoryRow {
  karte_no: string;
  display_name: string;
  valid_from: string;
  valid_to: string | null;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    karteNo: row.karte_no,
    familyName: row.family_name,
    givenName: row.given_name,
    familyKana: row.family_kana,
    givenKana: row.given_kana,
    status: row.status,
  };
}

const CUSTOMER_COLUMNS = "karte_no, family_name, given_name, family_kana, given_kana, status";

export class D1CustomerRepository implements CustomerRepository {
  constructor(private readonly db: D1Database) {}

  async listAll(): Promise<Customer[]> {
    const { results } = await this.db
      .prepare(`SELECT ${CUSTOMER_COLUMNS} FROM customers ORDER BY karte_no`)
      .all<CustomerRow>();
    return results.map(toCustomer);
  }

  async find(karteNo: string): Promise<Customer | undefined> {
    const row = await this.db
      .prepare(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE karte_no = ?`)
      .bind(karteNo)
      .first<CustomerRow>();
    return row ? toCustomer(row) : undefined;
  }

  async maxKarteNo(): Promise<string | null> {
    const row = await this.db.prepare("SELECT MAX(karte_no) AS max FROM customers").first<{ max: string | null }>();
    return row?.max ?? null;
  }

  async listDisplayNameHistory(karteNo?: string): Promise<DisplayNameHistoryEntry[]> {
    const base = "SELECT karte_no, display_name, valid_from, valid_to FROM display_name_history";
    const stmt = karteNo
      ? this.db.prepare(`${base} WHERE karte_no = ? ORDER BY id`).bind(karteNo)
      : this.db.prepare(`${base} ORDER BY karte_no, id`);
    const { results } = await stmt.all<HistoryRow>();
    return results.map((r) => ({
      karteNo: r.karte_no,
      displayName: r.display_name,
      validFrom: r.valid_from,
      validTo: r.valid_to,
    }));
  }

  async save(
    customer: Customer,
    { isNew, displayNameChanges, at }: { isNew: boolean; displayNameChanges: readonly DisplayNameChange[]; at: Date },
  ): Promise<void> {
    const now = at.toISOString();
    const c = customer;
    const statements: D1PreparedStatement[] = [
      isNew
        ? this.db
            .prepare(
              `INSERT INTO customers (${CUSTOMER_COLUMNS}, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(c.karteNo, c.familyName, c.givenName, c.familyKana, c.givenKana, c.status, now, now)
        : this.db
            .prepare(
              `UPDATE customers SET family_name = ?, given_name = ?, family_kana = ?, given_kana = ?, status = ?, updated_at = ?
               WHERE karte_no = ?`,
            )
            .bind(c.familyName, c.givenName, c.familyKana, c.givenKana, c.status, now, c.karteNo),
    ];
    for (const change of displayNameChanges) {
      if (change.before !== null) {
        statements.push(
          this.db
            .prepare("UPDATE display_name_history SET valid_to = ? WHERE karte_no = ? AND valid_to IS NULL")
            .bind(now, change.karteNo),
        );
      }
      if (change.after !== null) {
        statements.push(
          this.db
            .prepare("INSERT INTO display_name_history (karte_no, display_name, valid_from) VALUES (?, ?, ?)")
            .bind(change.karteNo, change.after, now),
        );
      }
    }
    try {
      // D1 の batch は1トランザクションとして実行され、途中で失敗すると全体がロールバックされる
      await this.db.batch(statements);
    } catch (e) {
      if (isNew && /UNIQUE constraint failed: customers\.karte_no/.test(String(e))) {
        throw new KarteNoConflictError(`カルテ番号 ${c.karteNo} は既に使われています`);
      }
      throw e;
    }
  }
}

/** 論理削除済みを含む最大番号 + 1 で採番する（物理削除がないため欠番は再利用されない） */
export class SequentialKarteNumberAllocator implements KarteNumberAllocator {
  constructor(private readonly customers: Pick<CustomerRepository, "maxKarteNo">) {}

  async next(): Promise<string> {
    return nextKarteNo(await this.customers.maxKarteNo());
  }
}
