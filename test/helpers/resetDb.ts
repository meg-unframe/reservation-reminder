import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

/**
 * テスト間でストレージが共有されるため、各テスト前にスキーマを作り直す。
 * customers は物理削除をトリガーで禁止しているので、DELETE ではなくテーブルごと DROP して再マイグレーションする。
 */
export async function resetDb(): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid DESC",
  ).all<{ name: string }>();
  // 作成順の逆（子テーブルから）に DROP して外部キー制約に抵触しないようにする
  await env.DB.batch(results.map(({ name }) => env.DB.prepare(`DROP TABLE "${name}"`)));
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}
