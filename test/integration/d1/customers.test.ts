import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { D1CustomerRepository, SequentialKarteNumberAllocator } from "../../../src/adapters/d1/D1CustomerRepository";
import { KarteNoConflictError } from "../../../src/ports/CustomerRepository";
import type { KarteNumberAllocator } from "../../../src/ports/KarteNumberAllocator";
import {
  CustomerNotFoundError,
  CustomerValidationError,
  deactivateCustomer,
  previewDisplayNameImpact,
  registerCustomer,
  updateCustomer,
  type CustomerDeps,
} from "../../../src/usecases/customers";
import { resetDb } from "../../helpers/resetDb";

const AT = new Date("2026-10-29T03:00:00Z");

function makeDeps(allocator?: KarteNumberAllocator): CustomerDeps {
  const customers = new D1CustomerRepository(env.DB);
  return { customers, allocator: allocator ?? new SequentialKarteNumberAllocator(customers), clock: { now: () => AT } };
}

async function currentDisplayName(karteNo: string): Promise<string | undefined> {
  const history = await new D1CustomerRepository(env.DB).listDisplayNameHistory(karteNo);
  return history.find((h) => h.validTo === null)?.displayName;
}

beforeEach(resetDb);

describe("顧客の登録と表示名履歴（架空データ）", () => {
  it("連番で採番し、表示名履歴を作る", async () => {
    const deps = makeDeps();
    const a = await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    const b = await registerCustomer(deps, { familyName: "佐藤", givenName: "健" });
    expect([a.customer.karteNo, b.customer.karteNo]).toEqual(["0001", "0002"]);
    expect(await currentDisplayName("0001")).toBe("田中様（0001）");
    expect(await currentDisplayName("0002")).toBe("佐藤様（0002）");
  });

  it("同姓を登録すると既存顧客の表示名も変わり、旧表示名が履歴に残る", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    const result = await registerCustomer(deps, { familyName: "田中", givenName: "友子" });

    expect(result.displayNameChanges).toEqual([
      { karteNo: "0001", before: "田中様（0001）", after: "田中(花)様（0001）" },
      { karteNo: "0002", before: null, after: "田中(友)様（0002）" },
    ]);
    expect(await deps.customers.listDisplayNameHistory("0001")).toEqual([
      { karteNo: "0001", displayName: "田中様（0001）", validFrom: AT.toISOString(), validTo: AT.toISOString() },
      { karteNo: "0001", displayName: "田中(花)様（0001）", validFrom: AT.toISOString(), validTo: null },
    ]);
  });

  it("プレビューは保存せずに影響を返す", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    const preview = await previewDisplayNameImpact(deps, { familyName: "田中", givenName: "友子" });
    expect(preview.customer.karteNo).toBe("0002");
    expect(preview.displayNameChanges.map((c) => c.karteNo)).toEqual(["0001", "0002"]);
    expect(await deps.customers.listAll()).toHaveLength(1);
    expect(await currentDisplayName("0001")).toBe("田中様（0001）");
  });

  it("氏名を編集すると表示名が更新される（番号は不変）", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    await registerCustomer(deps, { familyName: "田中", givenName: "友子" });
    const result = await updateCustomer(deps, "0002", { familyName: "鈴木", givenName: "友子" });
    expect(result.customer.karteNo).toBe("0002");
    expect(await currentDisplayName("0001")).toBe("田中様（0001）");
    expect(await currentDisplayName("0002")).toBe("鈴木様（0002）");
  });

  it("入力を検証する", async () => {
    const deps = makeDeps();
    await expect(registerCustomer(deps, { familyName: " ", givenName: "" })).rejects.toThrow(CustomerValidationError);
    await expect(registerCustomer(deps, { familyName: "田".repeat(31), givenName: "花子" })).rejects.toThrow(
      CustomerValidationError,
    );
    expect(await deps.customers.listAll()).toHaveLength(0);
  });
});

describe("論理削除と番号の再利用禁止", () => {
  it("論理削除後も番号は欠番として残り、次の登録で再利用されない", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    await registerCustomer(deps, { familyName: "佐藤", givenName: "健" });
    await deactivateCustomer(deps, "0002");
    const next = await registerCustomer(deps, { familyName: "鈴木", givenName: "一郎" });

    expect(next.customer.karteNo).toBe("0003");
    expect((await deps.customers.find("0002"))?.status).toBe("inactive");
    expect(await currentDisplayName("0002")).toBeUndefined();
  });

  it("同姓の一方を論理削除すると残った顧客は頭文字なしに戻る", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    await registerCustomer(deps, { familyName: "田中", givenName: "友子" });
    await deactivateCustomer(deps, "0002");
    expect(await currentDisplayName("0001")).toBe("田中様（0001）");
  });

  it("論理削除済みの顧客は編集・再削除できない", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "佐藤", givenName: "健" });
    await deactivateCustomer(deps, "0001");
    await expect(updateCustomer(deps, "0001", { familyName: "佐藤", givenName: "健" })).rejects.toThrow(
      CustomerNotFoundError,
    );
    await expect(deactivateCustomer(deps, "0001")).rejects.toThrow(CustomerNotFoundError);
  });
});

describe("DB 制約による保証", () => {
  async function seedOne() {
    await registerCustomer(makeDeps(), { familyName: "田中", givenName: "花子" });
  }

  it("カルテ番号の変更を拒否する", async () => {
    await seedOne();
    await expect(env.DB.prepare("UPDATE customers SET karte_no = '0002' WHERE karte_no = '0001'").run()).rejects.toThrow(
      /karte_no is immutable/,
    );
  });

  it("顧客の物理削除を拒否する", async () => {
    await seedOne();
    await expect(env.DB.prepare("DELETE FROM customers WHERE karte_no = '0001'").run()).rejects.toThrow(
      /cannot be deleted/,
    );
  });

  it.each(["0000", "12a4", "001", "00001"])("不正なカルテ番号 %j を拒否する", async (karteNo) => {
    await expect(
      env.DB.prepare(
        "INSERT INTO customers (karte_no, family_name, given_name, created_at, updated_at) VALUES (?, '田中', '花子', 'x', 'x')",
      )
        .bind(karteNo)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("現行表示名は顧客ごとに1行まで", async () => {
    await seedOne();
    await expect(
      env.DB.prepare("INSERT INTO display_name_history (karte_no, display_name, valid_from) VALUES ('0001', '別名', 'x')").run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("送信ログは simulation 以外のモードを拒否する", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO send_logs (target_date, event_id, start_at, karte_no, body, mode, status, retry_key, created_at)
         VALUES ('2026-10-30', 'e1', 's', '0001', 'b', 'live', 'simulated', 'k1', 'x')`,
      ).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});

describe("採番の衝突", () => {
  it("番号が衝突したら採番からやり直す", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    // 同時登録を模して、1回目だけ既存番号を返す採番器
    let calls = 0;
    const racy: KarteNumberAllocator = {
      next: async () => (calls++ === 0 ? "0001" : new SequentialKarteNumberAllocator(deps.customers).next()),
    };
    const result = await registerCustomer(makeDeps(racy), { familyName: "佐藤", givenName: "健" });
    expect(result.customer.karteNo).toBe("0002");
    expect(calls).toBe(2);
    expect(await currentDisplayName("0001")).toBe("田中様（0001）");
  });

  it("衝突は KarteNoConflictError として通知され、履歴は変更されない", async () => {
    const deps = makeDeps();
    await registerCustomer(deps, { familyName: "田中", givenName: "花子" });
    await expect(
      deps.customers.save(
        { karteNo: "0001", familyName: "田中", givenName: "友子", familyKana: "", givenKana: "", status: "active" },
        {
          isNew: true,
          displayNameChanges: [{ karteNo: "0001", before: "田中様（0001）", after: "田中(花)様（0001）" }],
          at: AT,
        },
      ),
    ).rejects.toThrow(KarteNoConflictError);
    expect(await currentDisplayName("0001")).toBe("田中様（0001）");
  });
});
