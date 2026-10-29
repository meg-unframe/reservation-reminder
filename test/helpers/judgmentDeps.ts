import { env } from "cloudflare:workers";
import { D1CustomerRepository, SequentialKarteNumberAllocator } from "../../src/adapters/d1/D1CustomerRepository";
import { D1JudgmentRepository } from "../../src/adapters/d1/D1JudgmentRepository";
import { D1SendLogRepository } from "../../src/adapters/d1/D1SendLogRepository";
import { SimulatedSender } from "../../src/adapters/sender/SimulatedSender";
import type { CalendarEvent } from "../../src/domain/types";
import type { Logger, LogFields } from "../../src/lib/logger";
import type { CalendarSource } from "../../src/ports/CalendarSource";
import type { Clock } from "../../src/ports/Clock";
import type { CustomerDeps } from "../../src/usecases/customers";
import type { JudgmentDeps } from "../../src/usecases/runDailyJudgment";

export const FIXED_NOW = new Date("2026-10-29T09:00:00Z"); // 18:00 JST

export const fixedClock: Clock = { now: () => FIXED_NOW };

/** テスト中に予定を書き換えたり、失敗を注入したりできるカレンダー */
export class InMemoryCalendar implements CalendarSource {
  events: CalendarEvent[] = [];
  failuresBeforeSuccess = 0;
  calls = 0;

  async listEvents(): Promise<CalendarEvent[]> {
    this.calls++;
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess--;
      throw new Error("calendar unavailable");
    }
    return structuredClone(this.events);
  }
}

export class RecordingLogger implements Logger {
  entries: { level: "info" | "error"; event: string; fields?: LogFields }[] = [];
  info(event: string, fields?: LogFields) {
    this.entries.push({ level: "info", event, ...(fields ? { fields } : {}) });
  }
  error(event: string, fields?: LogFields) {
    this.entries.push({ level: "error", event, ...(fields ? { fields } : {}) });
  }
}

export function customerDeps(): CustomerDeps {
  const customers = new D1CustomerRepository(env.DB);
  return { customers, allocator: new SequentialKarteNumberAllocator(customers), clock: fixedClock };
}

export function judgmentDeps(calendar: CalendarSource, logger: Logger = new RecordingLogger()): JudgmentDeps {
  return {
    calendar,
    customers: new D1CustomerRepository(env.DB),
    judgments: new D1JudgmentRepository(env.DB),
    sender: new SimulatedSender(new D1SendLogRepository(env.DB), fixedClock),
    clock: fixedClock,
    logger,
    retry: { retries: 3, baseDelayMs: 1, sleep: async () => {} },
  };
}

export const sendLogs = () => new D1SendLogRepository(env.DB);
export const judgments = () => new D1JudgmentRepository(env.DB);
