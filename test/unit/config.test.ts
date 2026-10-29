import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, type Env } from "../../src/config";

const base: Env = {
  DB: {} as D1Database,
  ENVIRONMENT: "local",
  SEND_MODE: "simulation",
  CALENDAR_SOURCE: "fixture",
};

describe("loadConfig", () => {
  it("シミュレーション・fixture の設定を受け入れる", () => {
    expect(loadConfig(base)).toEqual({
      environment: "local",
      sendMode: "simulation",
      calendarSource: "fixture",
      calendarId: undefined,
    });
  });

  it.each(["live", "allowlist", "", "SIMULATION"])("SEND_MODE=%j は拒否する", (mode) => {
    expect(() => loadConfig({ ...base, SEND_MODE: mode })).toThrow(ConfigError);
  });

  it("不正な ENVIRONMENT を拒否する", () => {
    expect(() => loadConfig({ ...base, ENVIRONMENT: "staging" })).toThrow(ConfigError);
  });

  it("google 指定時は CALENDAR_ID が必須", () => {
    expect(() => loadConfig({ ...base, CALENDAR_SOURCE: "google" })).toThrow(ConfigError);
    expect(loadConfig({ ...base, CALENDAR_SOURCE: "google", CALENDAR_ID: "test@group.calendar.google.com" }).calendarId)
      .toBe("test@group.calendar.google.com");
  });
});
