import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // テストはローカル扱い・シミュレーション・架空データで固定する
        bindings: { ENVIRONMENT: "local", SEND_MODE: "simulation", CALENDAR_SOURCE: "fixture" },
      },
    }),
  ],
});
