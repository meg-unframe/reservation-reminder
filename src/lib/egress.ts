/**
 * 外部通信の許可リスト。本番コードから外部へ通信するときは必ず guardedFetch を使う
 * （安全性テストで、このファイル以外から fetch() を直接呼んでいないことを検査している）。
 *
 * 初期段階で許可するのは Google カレンダー API（ステップ7）のみ。LINE などの送信先は含めない。
 * なお Cloudflare Access の公開鍵取得（*.cloudflareaccess.com）は Hono の JWT 検証が内部で行い、
 * チームドメインの形式は accessAuth で検証している。
 */
const ALLOWED_HOSTS: readonly string[] = ["oauth2.googleapis.com", "www.googleapis.com"];

export class EgressBlockedError extends Error {
  override name = "EgressBlockedError";
}

export function assertAllowedEgress(url: string | URL): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new EgressBlockedError(`許可されていない通信先です: ${parsed.protocol}//${parsed.hostname}`);
  }
}

export const guardedFetch = (input: string | URL, init?: RequestInit): Promise<Response> => {
  assertAllowedEgress(input);
  return fetch(input, init);
};
