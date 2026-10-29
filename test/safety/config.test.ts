import { describe, expect, it } from "vitest";
import { CRON_PRIMARY, CRON_RETRY } from "../../src/schedule";
import { fileContent } from "./repoFiles";

/** wrangler.toml の `KEY = "value"` を取り出す（コメント行は除く） */
function tomlString(key: string): string | undefined {
  const line = fileContent("wrangler.toml")
    .split("\n")
    .find((l) => !/^\s*#/.test(l) && new RegExp(`^\\s*${key}\\s*=`).test(l));
  return line ? /=\s*"([^"]*)"/.exec(line)?.[1] : undefined;
}

describe("デプロイ設定の既定値", () => {
  it("送信モードはシミュレーション固定", () => expect(tomlString("SEND_MODE")).toBe("simulation"));
  it("既定は本番扱い（認証バイパスはローカル指定時のみ）", () => expect(tomlString("ENVIRONMENT")).toBe("production"));
  it("予約の取得元は Fixture（架空予定）", () => expect(tomlString("CALENDAR_SOURCE")).toBe("fixture"));

  it("cron は 18:00 JST の本判定と 18:10 の保険実行で、コードの定数と一致する", () => {
    const crons = /crons\s*=\s*\[([^\]]*)\]/.exec(fileContent("wrangler.toml"))?.[1];
    expect(crons?.match(/"[^"]+"/g)?.map((s) => s.slice(1, -1))).toEqual([CRON_PRIMARY, CRON_RETRY]);
    expect(CRON_PRIMARY).toBe("0 9 * * *"); // UTC 09:00 = JST 18:00
  });

  it("秘密情報を [vars] に平文で書いていない", () => {
    for (const key of ["GOOGLE_ACCESS_TOKEN", "GOOGLE_SA_PRIVATE_KEY", "GOOGLE_SA_EMAIL", "ACCESS_AUD"]) {
      expect(tomlString(key), key).toBeUndefined();
    }
  });

  it("テストもシミュレーション・ローカル・Fixture で動く", () => {
    const vitestConfig = fileContent("vitest.config.ts");
    expect(vitestConfig).toContain('SEND_MODE: "simulation"');
    expect(vitestConfig).toContain('CALENDAR_SOURCE: "fixture"');
  });
});
