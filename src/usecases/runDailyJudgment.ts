import { classifyEvent, type CustomerLookup, type CustomerLookupEntry } from "../domain/classify";
import { computeDisplayNames } from "../domain/displayName";
import { toJstDateString } from "../domain/jstDate";
import { buildReminderMessage } from "../domain/template";
import type { CalendarEvent, Customer } from "../domain/types";
import { errorCodeOf, type Logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { CalendarSource } from "../ports/CalendarSource";
import type { Clock } from "../ports/Clock";
import type { CustomerRepository, DisplayNameHistoryEntry } from "../ports/CustomerRepository";
import type { JudgmentItem, JudgmentRepository, JudgmentTrigger } from "../ports/JudgmentRepository";
import type { ReminderSender } from "../ports/ReminderSender";

export interface JudgmentDeps {
  calendar: CalendarSource;
  customers: CustomerRepository;
  judgments: JudgmentRepository;
  sender: ReminderSender;
  clock: Clock;
  logger: Logger;
  /** 予定取得の再試行（既定: 1s / 2s / 4s の最大3回） */
  retry?: { retries: number; baseDelayMs: number; sleep?: (ms: number) => Promise<void> };
}

export type JudgmentOutcome =
  | { status: "skipped"; runId: number }
  | {
      status: "success";
      runId: number;
      counts: { notify: number; review: number; excluded: number; simulated: number; duplicate: number };
    };

/** 現行表示名は顧客マスタから計算し、旧表示名は履歴から取る */
export function buildCustomerLookup(
  customers: readonly Customer[],
  history: readonly DisplayNameHistoryEntry[],
): CustomerLookup {
  const current = computeDisplayNames(customers);
  const entries = new Map<string, CustomerLookupEntry>(
    customers.map((c) => [
      c.karteNo,
      {
        status: c.status,
        familyName: c.familyName,
        currentDisplayName: current.get(c.karteNo) ?? null,
        pastDisplayNames: history.filter((h) => h.karteNo === c.karteNo && h.validTo !== null).map((h) => h.displayName),
      },
    ]),
  );
  return (karteNo) => entries.get(karteNo);
}

/** 予定開始日が対象日のものだけを残す（前日から日をまたぐ予定などを除く） */
function startsOn(event: CalendarEvent, targetDate: string): boolean {
  return event.allDay ? event.startAt === targetDate : toJstDateString(new Date(event.startAt)) === targetDate;
}

/**
 * 対象日の予約を判定し、スナップショットを保存して通知対象の送信をシミュレーションする。
 * - 定時（cron / cron_retry）は、同日の定時判定が既に成功していれば何もしない
 * - 手動はいつでも再判定できる。送信ログは予約ごとに一意なので重複しない
 */
export async function runDailyJudgment(
  deps: JudgmentDeps,
  { targetDate, trigger }: { targetDate: string; trigger: JudgmentTrigger },
): Promise<JudgmentOutcome> {
  const { judgments, logger, clock } = deps;
  if (trigger !== "manual") {
    const done = await judgments.findScheduledSuccess(targetDate);
    if (done) {
      logger.info("judgment.skipped", { targetDate, trigger, runId: done.id });
      return { status: "skipped", runId: done.id };
    }
  }

  const runId = await judgments.startRun(targetDate, trigger, clock.now());
  logger.info("judgment.started", { targetDate, trigger, runId });
  try {
    const retry = deps.retry ?? { retries: 3, baseDelayMs: 1000 };
    const events = await withRetry(() => deps.calendar.listEvents(targetDate), {
      ...retry,
      onRetry: (attempt, e) => logger.error("judgment.calendar_retry", { runId, attempt, errorCode: errorCodeOf(e) }),
    });
    const [customers, history] = await Promise.all([deps.customers.listAll(), deps.customers.listDisplayNameHistory()]);
    const lookup = buildCustomerLookup(customers, history);

    const items: JudgmentItem[] = events
      .filter((e) => startsOn(e, targetDate))
      .map((e) => {
        // 説明欄はメニュー抽出にのみ使い、スナップショットには保存しない
        const { description: _description, ...event } = e;
        return { event, ...classifyEvent(e, lookup) };
      });
    await judgments.replaceItems(targetDate, runId, items);

    const counts = { notify: 0, review: 0, excluded: 0, simulated: 0, duplicate: 0 };
    for (const item of items) {
      counts[item.result]++;
      if (item.result !== "notify" || !item.karteNo) continue;
      const body = buildReminderMessage({
        familyName: lookup(item.karteNo)!.familyName,
        startAt: item.event.startAt,
        ...(item.menu ? { menu: item.menu } : {}),
      });
      const outcome = await deps.sender.send({
        targetDate,
        eventId: item.event.eventId,
        startAt: item.event.startAt,
        karteNo: item.karteNo,
        body,
        runId,
      });
      counts[outcome]++;
    }

    await judgments.finishRun(runId, { status: "success" }, clock.now());
    logger.info("judgment.finished", { targetDate, trigger, runId, counts });
    return { status: "success", runId, counts };
  } catch (e) {
    const errorCode = errorCodeOf(e);
    await judgments.finishRun(runId, { status: "failed", errorCode }, clock.now());
    logger.error("judgment.failed", { targetDate, trigger, runId, errorCode });
    throw e;
  }
}
