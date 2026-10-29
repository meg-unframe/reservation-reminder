import { computeDisplayNames, diffDisplayNames, type DisplayNameChange } from "../domain/displayName";
import type { Customer } from "../domain/types";
import type { Clock } from "../ports/Clock";
import { KarteNoConflictError, type CustomerRepository } from "../ports/CustomerRepository";
import type { KarteNumberAllocator } from "../ports/KarteNumberAllocator";

export interface CustomerDeps {
  customers: CustomerRepository;
  allocator: KarteNumberAllocator;
  clock: Clock;
}

export interface CustomerInput {
  familyName: string;
  givenName: string;
  familyKana?: string;
  givenKana?: string;
}

export class CustomerValidationError extends Error {
  override name = "CustomerValidationError";
  constructor(readonly fieldErrors: Partial<Record<keyof CustomerInput, string>>) {
    super(Object.values(fieldErrors).join(" / "));
  }
}

export class CustomerNotFoundError extends Error {
  override name = "CustomerNotFoundError";
}

export interface CustomerChangeResult {
  customer: Customer;
  /** この操作で表示名が変わる顧客（操作対象以外の同姓顧客を含む） */
  displayNameChanges: DisplayNameChange[];
}

const NAME_MAX_LENGTH = 30;
const MAX_ALLOCATION_ATTEMPTS = 3;

function validate(input: CustomerInput): Required<CustomerInput> {
  const values = {
    familyName: input.familyName.trim(),
    givenName: input.givenName.trim(),
    familyKana: (input.familyKana ?? "").trim(),
    givenKana: (input.givenKana ?? "").trim(),
  };
  const errors: CustomerValidationError["fieldErrors"] = {};
  if (!values.familyName) errors.familyName = "姓は必須です";
  if (!values.givenName) errors.givenName = "名は必須です（同姓時の頭文字に使います）";
  for (const key of Object.keys(values) as (keyof CustomerInput)[]) {
    if (Array.from(values[key]).length > NAME_MAX_LENGTH && !errors[key]) {
      errors[key] = `${NAME_MAX_LENGTH}文字以内で入力してください`;
    }
  }
  if (Object.keys(errors).length > 0) throw new CustomerValidationError(errors);
  return values;
}

function replace(all: readonly Customer[], next: Customer): Customer[] {
  const others = all.filter((c) => c.karteNo !== next.karteNo);
  return [...others, next];
}

function plan(all: readonly Customer[], next: Customer): DisplayNameChange[] {
  return diffDisplayNames(computeDisplayNames(all), computeDisplayNames(replace(all, next)));
}

async function requireActive(customers: CustomerRepository, karteNo: string): Promise<Customer> {
  const customer = await customers.find(karteNo);
  if (!customer || customer.status !== "active") {
    throw new CustomerNotFoundError(`有効な顧客が見つかりません: ${karteNo}`);
  }
  return customer;
}

/** 登録・編集の前に「他の顧客の表示名も変わる」ことを確認するためのプレビュー（保存しない） */
export async function previewDisplayNameImpact(
  deps: Pick<CustomerDeps, "customers" | "allocator">,
  input: CustomerInput,
  karteNo?: string,
): Promise<CustomerChangeResult> {
  const values = validate(input);
  const all = await deps.customers.listAll();
  const customer: Customer = karteNo
    ? { ...(await requireActive(deps.customers, karteNo)), ...values }
    : { karteNo: await deps.allocator.next(), ...values, status: "active" };
  return { customer, displayNameChanges: plan(all, customer) };
}

/** 論理削除の前に、残る同姓顧客の表示名がどう変わるかを確認するためのプレビュー（保存しない） */
export async function previewDeactivation(
  deps: Pick<CustomerDeps, "customers">,
  karteNo: string,
): Promise<CustomerChangeResult> {
  const customer: Customer = { ...(await requireActive(deps.customers, karteNo)), status: "inactive" };
  return { customer, displayNameChanges: plan(await deps.customers.listAll(), customer) };
}

export async function registerCustomer(deps: CustomerDeps, input: CustomerInput): Promise<CustomerChangeResult> {
  const values = validate(input);
  for (let attempt = 1; ; attempt++) {
    const all = await deps.customers.listAll();
    const customer: Customer = { karteNo: await deps.allocator.next(), ...values, status: "active" };
    const displayNameChanges = plan(all, customer);
    try {
      await deps.customers.save(customer, { isNew: true, displayNameChanges, at: deps.clock.now() });
      return { customer, displayNameChanges };
    } catch (e) {
      // 同時登録で番号が衝突した場合のみ採番からやり直す
      if (!(e instanceof KarteNoConflictError) || attempt >= MAX_ALLOCATION_ATTEMPTS) throw e;
    }
  }
}

/** 氏名の編集。カルテ番号は変更できない。 */
export async function updateCustomer(
  deps: CustomerDeps,
  karteNo: string,
  input: CustomerInput,
): Promise<CustomerChangeResult> {
  const values = validate(input);
  const current = await requireActive(deps.customers, karteNo);
  const all = await deps.customers.listAll();
  const customer: Customer = { ...current, ...values };
  const displayNameChanges = plan(all, customer);
  await deps.customers.save(customer, { isNew: false, displayNameChanges, at: deps.clock.now() });
  return { customer, displayNameChanges };
}

/** 論理削除。番号は欠番として残り、再利用されない。 */
export async function deactivateCustomer(deps: CustomerDeps, karteNo: string): Promise<CustomerChangeResult> {
  const current = await requireActive(deps.customers, karteNo);
  const all = await deps.customers.listAll();
  const customer: Customer = { ...current, status: "inactive" };
  const displayNameChanges = plan(all, customer);
  await deps.customers.save(customer, { isNew: false, displayNameChanges, at: deps.clock.now() });
  return { customer, displayNameChanges };
}
