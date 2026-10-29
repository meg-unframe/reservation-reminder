import type { MiddlewareHandler } from "hono";
import { verifyWithJwks } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";
import type { AppEnv } from "../types";

const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

export interface AccessAuthOptions {
  /** テスト用: JWKS を取得せずにこの公開鍵で検証する */
  keys?: HonoJsonWebKey[];
}

/**
 * Cloudflare Access の JWT（Cf-Access-Jwt-Assertion）を Worker 側でも検証する（多層防御）。
 * ローカル環境のみ検証を省略する。設定が欠けていれば全リクエストを拒否する（fail closed）。
 */
export function accessAuth(options: AccessAuthOptions = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.var.config.environment === "local") return next();

    const team = c.env.ACCESS_TEAM_DOMAIN;
    const aud = c.env.ACCESS_AUD;
    if (!team || !TEAM_DOMAIN.test(team) || !aud) {
      return c.text("管理画面の認証設定がありません", 503);
    }
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    if (!token) return c.text("Forbidden", 403);
    try {
      await verifyWithJwks(token, {
        ...(options.keys ? { keys: options.keys } : { jwks_uri: `https://${team}/cdn-cgi/access/certs` }),
        allowedAlgorithms: ["RS256"],
        verification: { iss: `https://${team}`, aud },
      });
    } catch {
      return c.text("Forbidden", 403);
    }
    await next();
  };
}
