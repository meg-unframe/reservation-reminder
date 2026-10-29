export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  SEND_MODE: string;
  CALENDAR_SOURCE: string;
  CALENDAR_ID?: string;
  /** ローカル開発専用。サービスアカウントの権限借用で手元発行した短時間トークン（秘密鍵は使わない） */
  GOOGLE_ACCESS_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export type Environment = "local" | "production";
export type CalendarSourceKind = "fixture" | "google";

export interface AppConfig {
  environment: Environment;
  sendMode: "simulation";
  calendarSource: CalendarSourceKind;
  calendarId: string | undefined;
  googleAccessToken: string | undefined;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** 環境変数を検証する。初期段階は送信モードを simulation 以外にできない。 */
export function loadConfig(env: Env): AppConfig {
  if (env.SEND_MODE !== "simulation") {
    throw new ConfigError(`SEND_MODE は "simulation" のみ許可されています（現在: "${env.SEND_MODE}"）`);
  }
  if (env.ENVIRONMENT !== "local" && env.ENVIRONMENT !== "production") {
    throw new ConfigError(`ENVIRONMENT が不正です: "${env.ENVIRONMENT}"`);
  }
  if (env.CALENDAR_SOURCE !== "fixture" && env.CALENDAR_SOURCE !== "google") {
    throw new ConfigError(`CALENDAR_SOURCE が不正です: "${env.CALENDAR_SOURCE}"`);
  }
  if (env.CALENDAR_SOURCE === "google") {
    // 本番の認証方式は未決定。手元発行トークンの方式はローカル以外で使わせない
    if (env.ENVIRONMENT !== "local") {
      throw new ConfigError("CALENDAR_SOURCE=google は現在 ENVIRONMENT=local でのみ使用できます");
    }
    if (!env.CALENDAR_ID) throw new ConfigError("CALENDAR_SOURCE=google の場合は CALENDAR_ID が必要です");
    if (!env.GOOGLE_ACCESS_TOKEN) {
      throw new ConfigError("CALENDAR_SOURCE=google の場合は GOOGLE_ACCESS_TOKEN が必要です");
    }
  }
  return {
    environment: env.ENVIRONMENT,
    sendMode: "simulation",
    calendarSource: env.CALENDAR_SOURCE,
    calendarId: env.CALENDAR_ID || undefined,
    googleAccessToken: env.GOOGLE_ACCESS_TOKEN || undefined,
  };
}
