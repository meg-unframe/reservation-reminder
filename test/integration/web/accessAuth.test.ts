import { env } from "cloudflare:workers";
import { sign } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/web/app";
import { resetDb } from "../../helpers/resetDb";

const TEAM = "example-team.cloudflareaccess.com";
const AUD = "test-aud-123";
const prodEnv = { ...env, ENVIRONMENT: "production", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };

let publicJwk: HonoJsonWebKey;
let privateJwk: HonoJsonWebKey;

beforeAll(async () => {
  // テスト専用の鍵をその場で生成する（JWKS の取得＝外部通信は行わない）
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const meta = { kid: "test-key", alg: "RS256" };
  publicJwk = { ...((await crypto.subtle.exportKey("jwk", pair.publicKey)) as HonoJsonWebKey), ...meta };
  privateJwk = { ...((await crypto.subtle.exportKey("jwk", pair.privateKey)) as HonoJsonWebKey), ...meta };
});

beforeEach(resetDb);

const now = () => Math.floor(Date.now() / 1000);

async function token(overrides: Record<string, unknown> = {}) {
  return sign({ iss: `https://${TEAM}`, aud: [AUD], email: "admin@example.com", iat: now(), exp: now() + 300, ...overrides }, privateJwk);
}

async function get(path: string, headers: Record<string, string> = {}, envOverride: Record<string, unknown> = prodEnv) {
  const app = createApp({ access: { keys: [publicJwk] } });
  return app.fetch(new Request(`http://localhost${path}`, { headers }), envOverride);
}

describe("Cloudflare Access 認証（本番設定）", () => {
  it("正しいトークンなら管理画面を表示する", async () => {
    const res = await get("/", { "Cf-Access-Jwt-Assertion": await token() });
    expect(res.status).toBe(200);
  });

  it("トークンがなければ 403", async () => {
    expect((await get("/")).status).toBe(403);
    expect((await get("/customers")).status).toBe(403);
  });

  it.each([
    ["aud 違い", { aud: ["other-aud"] }],
    ["iss 違い", { iss: "https://evil.cloudflareaccess.com" }],
    ["期限切れ", { iat: now() - 3600, exp: now() - 60 }],
  ])("%s のトークンは 403", async (_label, overrides) => {
    expect((await get("/", { "Cf-Access-Jwt-Assertion": await token(overrides) })).status).toBe(403);
  });

  it("改ざんされたトークンは 403", async () => {
    const [h, , s] = (await token()).split(".");
    const forged = `${h}.${btoa(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: now() + 300 })).replace(/=+$/, "")}.${s}`;
    expect((await get("/", { "Cf-Access-Jwt-Assertion": forged })).status).toBe(403);
  });

  it("認証設定が欠けていれば全拒否（503）", async () => {
    const res = await get("/", { "Cf-Access-Jwt-Assertion": await token() }, { ...env, ENVIRONMENT: "production" });
    expect(res.status).toBe(503);
  });

  it("不正なチームドメインの設定は拒否（503）", async () => {
    const res = await get("/", { "Cf-Access-Jwt-Assertion": await token() }, { ...prodEnv, ACCESS_TEAM_DOMAIN: "evil.example.com" });
    expect(res.status).toBe(503);
  });

  it("/healthz は認証なしで応答し、/dev/seed は本番では存在しない", async () => {
    const app = createApp({ access: { keys: [publicJwk] } });
    expect((await app.fetch(new Request("http://localhost/healthz"), prodEnv)).status).toBe(200);
    expect((await app.fetch(new Request("http://localhost/dev/seed", { method: "POST" }), prodEnv)).status).toBe(404);
  });
});
