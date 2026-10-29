import { D1ChangeAckRepository } from "./adapters/d1/D1ChangeAckRepository";
import { D1CustomerRepository, SequentialKarteNumberAllocator } from "./adapters/d1/D1CustomerRepository";
import { D1JudgmentRepository } from "./adapters/d1/D1JudgmentRepository";
import { D1SendLogRepository } from "./adapters/d1/D1SendLogRepository";
import { FixtureCalendarSource } from "./adapters/fixture/FixtureCalendarSource";
import { GoogleCalendarSource } from "./adapters/google/GoogleCalendarSource";
import { StaticAccessTokenProvider } from "./adapters/google/StaticAccessTokenProvider";
import { SimulatedSender } from "./adapters/sender/SimulatedSender";
import { ConfigError, type AppConfig, type Env } from "./config";
import { consoleLogger } from "./lib/logger";
import type { CalendarSource } from "./ports/CalendarSource";
import { systemClock } from "./ports/Clock";
import type { ReadDeps } from "./usecases/adminViews";
import type { CustomerDeps } from "./usecases/customers";
import type { ChangeDeps } from "./usecases/detectPostJudgmentChanges";
import type { JudgmentDeps } from "./usecases/runDailyJudgment";

export function createCalendarSource(config: AppConfig): CalendarSource {
  switch (config.calendarSource) {
    case "fixture":
      return new FixtureCalendarSource();
    case "google": {
      const { calendarId, googleAccessToken } = config;
      // loadConfig で検証済み。型を絞るための確認
      if (!calendarId || !googleAccessToken) throw new ConfigError("Google カレンダーの設定が不足しています");
      return new GoogleCalendarSource({ calendarId, tokens: new StaticAccessTokenProvider(googleAccessToken) });
    }
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

export function createChangeDeps(env: Env, calendar: CalendarSource): ChangeDeps {
  return {
    calendar,
    judgments: new D1JudgmentRepository(env.DB),
    acks: new D1ChangeAckRepository(env.DB),
    clock: systemClock,
  };
}

export function createJudgmentDeps(env: Env, config: AppConfig, calendar = createCalendarSource(config)): JudgmentDeps {
  return {
    calendar,
    customers: new D1CustomerRepository(env.DB),
    judgments: new D1JudgmentRepository(env.DB),
    // 送信は常にシミュレーション（実送信の実装は存在しない）
    sender: new SimulatedSender(new D1SendLogRepository(env.DB), systemClock),
    clock: systemClock,
    logger: consoleLogger,
  };
}
