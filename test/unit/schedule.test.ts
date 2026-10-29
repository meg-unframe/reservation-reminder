import { describe, expect, it } from "vitest";
import { CRON_PRIMARY, CRON_RETRY, triggerOfCron } from "../../src/schedule";

describe("triggerOfCron", () => {
  it("本判定と保険実行を区別する", () => {
    expect(triggerOfCron(CRON_PRIMARY)).toBe("cron");
    expect(triggerOfCron(CRON_RETRY)).toBe("cron_retry");
  });
  it("未知の cron 式は拒否する", () => expect(() => triggerOfCron("* * * * *")).toThrow());
});
