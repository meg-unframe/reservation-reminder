import { D1CustomerRepository, SequentialKarteNumberAllocator } from "./adapters/d1/D1CustomerRepository";
import { D1JudgmentRepository } from "./adapters/d1/D1JudgmentRepository";
import { D1SendLogRepository } from "./adapters/d1/D1SendLogRepository";
import { FixtureCalendarSource } from "./adapters/fixture/FixtureCalendarSource";
import { SimulatedSender } from "./adapters/sender/SimulatedSender";
import type { AppConfig, Env } from "./config";
import { consoleLogger } from "./lib/logger";
import type { CalendarSource } from "./ports/CalendarSource";
import { systemClock } from "./ports/Clock";
import type { ReadDeps } from "./usecases/adminViews";
import type { CustomerDeps } from "./usecases/customers";
import type { JudgmentDeps } from "./usecases/runDailyJudgment";

function createCalendarSource(config: AppConfig): CalendarSource {
  switch (config.calendarSource) {
    case "fixture":
      return new FixtureCalendarSource();
    case "google":
      throw new Error("Google カレンダー連携はステップ7で実装します");
  }
}

export function createCustomerDeps(env: Env): CustomerDeps {
  const customers = new D1CustomerRepository(env.DB);
  return { customers, allocator: new SequentialKarteNumberAllocator(customers), clock: systemClock };
}

export function createReadDeps(env: Env): ReadDeps {
  return {
    customers: new D1CustomerRepository(env.DB),
    judgments: new D1JudgmentRepository(env.DB),
    sendLogs: new D1SendLogRepository(env.DB),
    clock: systemClock,
  };
}

export function createJudgmentDeps(env: Env, config: AppConfig): JudgmentDeps {
  return {
    calendar: createCalendarSource(config),
    customers: new D1CustomerRepository(env.DB),
    judgments: new D1JudgmentRepository(env.DB),
    // 送信は常にシミュレーション（実送信の実装は存在しない）
    sender: new SimulatedSender(new D1SendLogRepository(env.DB), systemClock),
    clock: systemClock,
    logger: consoleLogger,
  };
}
