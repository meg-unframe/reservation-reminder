import type { Clock } from "../../ports/Clock";
import type { ReminderMessage, ReminderSender, SendOutcome } from "../../ports/ReminderSender";
import type { SendLogRepository } from "../../ports/SendLogRepository";

/** 送信したことにして送信ログへ記録するだけの実装。外部への通信は一切行わない。 */
export class SimulatedSender implements ReminderSender {
  constructor(
    private readonly logs: SendLogRepository,
    private readonly clock: Clock,
  ) {}

  async send(message: ReminderMessage): Promise<SendOutcome> {
    const inserted = await this.logs.insertIfAbsent(message, { retryKey: crypto.randomUUID(), at: this.clock.now() });
    return inserted ? "simulated" : "duplicate";
  }
}
