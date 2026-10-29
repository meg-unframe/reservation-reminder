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
      googleAccessToken: undefined,
    });
  });

  it.each(["live", "allowlist", "", "SIMULATION"])("SEND_MODE=%j は拒否する", (mode) => {
    expect(() => loadConfig({ ...base, SEND_MODE: mode })).toThrow(ConfigError);
  });

  it("不正な ENVIRONMENT を拒否する", () => {
    expect(() => loadConfig({ ...base, ENVIRONMENT: "staging" })).toThrow(ConfigError);
  });

  describe("google 指定時", () => {
    const google: Env = {
      ...base,
      CALENDAR_SOURCE: "google",
      CALENDAR_ID: "test@group.calendar.google.com",
      GOOGLE_ACCESS_TOKEN: "dummy-token",
    };

    it("CALENDAR_ID とトークンがあれば受け入れる", () => {
      expect(loadConfig(google)).toMatchObject({
        calendarSource: "google",
        calendarId: "test@group.calendar.google.com",
        googleAccessToken: "dummy-token",
      });
    });

    it.each(["CALENDAR_ID", "GOOGLE_ACCESS_TOKEN"] as const)("%s がなければ拒否する", (key) => {
      expect(() => loadConfig({ ...google, [key]: "" })).toThrow(ConfigError);
    });

    it("本番（ENVIRONMENT=production）では拒否する（認証方式が未決定のため）", () => {
      expect(() => loadConfig({ ...google, ENVIRONMENT: "production" })).toThrow(ConfigError);
    });
  });
});
