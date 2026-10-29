import fixture from "../../fixtures/customers.json";
import { deactivateCustomer, registerCustomer, type CustomerDeps, type CustomerInput } from "./customers";

export interface FixtureCustomer extends CustomerInput {
  deactivate?: boolean;
}

/**
 * 架空顧客を登録順に投入する（ローカル開発・テスト専用）。
 * 通常の登録処理を通すため、同姓追加による表示名の変化も履歴に残る。顧客が既にいれば何もしない。
 */
export async function seedFixtureCustomers(
  deps: CustomerDeps,
  customers: readonly FixtureCustomer[] = fixture.customers,
): Promise<{ seeded: number }> {
  if ((await deps.customers.maxKarteNo()) !== null) return { seeded: 0 };
  for (const { deactivate, ...input } of customers) {
    const { customer } = await registerCustomer(deps, input);
    if (deactivate) await deactivateCustomer(deps, customer.karteNo);
  }
  return { seeded: customers.length };
}
