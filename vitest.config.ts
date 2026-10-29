import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // プロジェクトルート（npm scripts の実行ディレクトリ）基準
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // テストはローカル扱い・シミュレーション・架空データで固定する
          bindings: {
            ENVIRONMENT: "local",
            SEND_MODE: "simulation",
            CALENDAR_SOURCE: "fixture",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup/applyMigrations.ts"],
    },
  };
});
