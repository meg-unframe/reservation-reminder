import { computeDisplayNames } from "../domain/displayName";
import { isNearKarteNoLimit } from "../domain/karteNo";
import { toJstDateString, toJstMonthKey, tomorrowInJst } from "../domain/jstDate";
import type { Customer } from "../domain/types";
import type { Clock } from "../ports/Clock";
import type { CustomerRepository, DisplayNameHistoryEntry } from "../ports/CustomerRepository";
import type { JudgmentItem, JudgmentRepository, JudgmentRun } from "../ports/JudgmentRepository";
import type { SendLog, SendLogRepository } from "../ports/SendLogRepository";

/** LINE コミュニケーションプランの無料メッセージ数（月） */
export const MONTHLY_FREE_LIMIT = 200;
export const MONTHLY_WARN_RATIO = 0.8;
const DISPLAY_NAME_CHANGE_DAYS = 30;

export interface ReadDeps {
  customers: CustomerRepository;
  judgments: JudgmentRepository;
  sendLogs: SendLogRepository;
  clock: Clock;
}

export interface MonthlyUsage {
  monthKey: string;
  sent: number;
  limit: number;
  warn: boolean;
}

export interface RecentDisplayNameChange {
  karteNo: string;
  before: string;
  /** 論理削除で表示名が無くなった場合は null */
  after: string | null;
  changedAt: string;
}

export interface Dashboard {
  today: string;
  tomorrow: string;
  tomorrowRun: JudgmentRun | undefined;
  tomorrowCounts: { notify: number; review: number; excluded: number; titleOutdated: number } | undefined;
  monthly: MonthlyUsage;
  /** 最新の実行が失敗のままの対象日 */
  failedDates: string[];
  karteNo: { max: string | null; nearLimit: boolean };
  recentDisplayNameChanges: RecentDisplayNameChange[];
}

export async function getMonthlyUsage(sendLogs: SendLogRepository, monthKey: string): Promise<MonthlyUsage> {
  const sent = await sendLogs.countInJstMonth(monthKey);
  return { monthKey, sent, limit: MONTHLY_FREE_LIMIT, warn: sent >= MONTHLY_FREE_LIMIT * MONTHLY_WARN_RATIO };
}

/** 旧表示名が閉じられた履歴から「表示名が変わった顧客」を作る */
export function recentDisplayNameChanges(
  history: readonly DisplayNameHistoryEntry[],
  since: Date,
): RecentDisplayNameChange[] {
  return history
    .filter((h) => h.validTo !== null && Date.parse(h.validTo) >= since.getTime())
    .map((h) => ({
      karteNo: h.karteNo,
      before: h.displayName,
      after: history.find((n) => n.karteNo === h.karteNo && n.validFrom === h.validTo)?.displayName ?? null,
      changedAt: h.validTo!,
    }))
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt) || a.karteNo.localeCompare(b.karteNo));
}

function latestFailedDates(runs: readonly JudgmentRun[]): string[] {
  const latest = new Map<string, JudgmentRun>();
  for (const run of runs) {
    const current = latest.get(run.targetDate);
    if (!current || run.id > current.id) latest.set(run.targetDate, run);
  }
  return [...latest.values()].filter((r) => r.status === "failed").map((r) => r.targetDate).sort();
}

export async function getDashboard(deps: ReadDeps): Promise<Dashboard> {
  const now = deps.clock.now();
  const tomorrow = tomorrowInJst(now);
  const [runs, items, monthly, max, history] = await Promise.all([
    deps.judgments.listRuns({ limit: 30 }),
    deps.judgments.listItems(tomorrow),
    getMonthlyUsage(deps.sendLogs, toJstMonthKey(now)),
    deps.customers.maxKarteNo(),
    deps.customers.listDisplayNameHistory(),
  ]);
  const tomorrowRun = runs.find((r) => r.targetDate === tomorrow);
  return {
    today: toJstDateString(now),
    tomorrow,
    tomorrowRun,
    tomorrowCounts: tomorrowRun
      ? {
          notify: items.filter((i) => i.result === "notify").length,
          review: items.filter((i) => i.result === "review").length,
          excluded: items.filter((i) => i.result === "excluded").length,
          titleOutdated: items.filter((i) => i.warning === "title_outdated").length,
        }
      : undefined,
    monthly,
    failedDates: latestFailedDates(runs),
    karteNo: { max, nearLimit: isNearKarteNoLimit(max) },
    recentDisplayNameChanges: recentDisplayNameChanges(
      history,
      new Date(now.getTime() - DISPLAY_NAME_CHANGE_DAYS * 24 * 60 * 60 * 1000),
    ),
  };
}

export interface JudgmentRow extends JudgmentItem {
  /** 顧客の現行表示名（未登録・論理削除済みなら null） */
  currentDisplayName: string | null;
  sendLog: SendLog | undefined;
}

export interface JudgmentView {
  date: string;
  runs: JudgmentRun[];
  rows: JudgmentRow[];
}

export async function getJudgmentView(deps: ReadDeps, date: string): Promise<JudgmentView> {
  const [runs, items, logs, customers] = await Promise.all([
    deps.judgments.listRuns({ targetDate: date, limit: 20 }),
    deps.judgments.listItems(date),
    deps.sendLogs.list({ targetDate: date, limit: 1000 }),
    deps.customers.listAll(),
  ]);
  const names = computeDisplayNames(customers);
  const logByEvent = new Map(logs.map((l) => [`${l.eventId}|${Date.parse(l.startAt)}`, l]));
  return {
    date,
    runs,
    rows: items.map((item) => ({
      ...item,
      currentDisplayName: item.karteNo ? (names.get(item.karteNo) ?? null) : null,
      sendLog: logByEvent.get(`${item.event.eventId}|${Date.parse(item.event.startAt)}`),
    })),
  };
}

export interface CustomerRow extends Customer {
  displayName: string | null;
}

export async function listCustomerRows(deps: Pick<ReadDeps, "customers">): Promise<CustomerRow[]> {
  const customers = await deps.customers.listAll();
  const names = computeDisplayNames(customers);
  return customers.map((c) => ({ ...c, displayName: names.get(c.karteNo) ?? null }));
}

export async function getCustomerDetail(
  deps: Pick<ReadDeps, "customers">,
  karteNo: string,
): Promise<{ customer: CustomerRow; history: DisplayNameHistoryEntry[] } | undefined> {
  const customer = (await listCustomerRows(deps)).find((c) => c.karteNo === karteNo);
  if (!customer) return undefined;
  return { customer, history: await deps.customers.listDisplayNameHistory(karteNo) };
}
