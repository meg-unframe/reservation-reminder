import { describe, expect, it } from "vitest";
import { fileContent, sourceFiles } from "./repoFiles";

// 初期段階は LINE への送信経路を一切持たない（明示的な許可が出るまで実装しない）
const LINE_PATTERNS: [string, RegExp][] = [
  ["LINE API エンドポイント", /(?:api|api-data|access|notify-api)\.line\.me/i],
  ["LINE ドメイン", /\bline\.me\b/i],
  ["LINE SDK", /@line\//],
  ["Messaging API", /messaging[-_ ]?api/i],
  ["チャネルアクセストークン/シークレット", /channel[-_ ]?(?:access[-_ ]?token|secret)/i],
  ["LINE 用の環境変数", /\bLINE_[A-Z_]+/],
  ["Webhook 署名ヘッダー", /x-line-signature/i],
];

describe("LINE 連携が存在しないこと", () => {
  it("本番ソースが読み込めている", () => {
    expect(Object.keys(sourceFiles).length).toBeGreaterThan(20);
    expect(sourceFiles["src/index.ts"]).toBeDefined();
  });

  it("検査パターン自体が LINE の識別子を検出できる", () => {
    // 検出用サンプルは実行時に組み立てる（このファイル自体が検査に引っかからないように）
    const samples = [
      `https://api.${"line"}.me/v2/bot/message/push`,
      `import { messagingApi } from "@${"line"}/bot-sdk"`,
      `LINE_${"CHANNEL"}_SECRET`,
      `x-${"line"}-signature`,
    ];
    for (const sample of samples) {
      expect(LINE_PATTERNS.some(([, p]) => p.test(sample)), sample).toBe(true);
    }
  });

  it.each(LINE_PATTERNS)("src に %s が含まれない", (_label, pattern) => {
    const hits = Object.entries(sourceFiles)
      .filter(([, content]) => pattern.test(content))
      .map(([path]) => path);
    expect(hits).toEqual([]);
  });

  it("依存パッケージに LINE SDK がない", () => {
    const pkg = JSON.parse(fileContent("package.json")) as Record<string, Record<string, string> | undefined>;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    expect(deps.filter((d) => /line/i.test(d))).toEqual([]);
  });

  it.each(["wrangler.toml", ".dev.vars.example"])("%s に LINE 用の設定がない", (path) => {
    const activeLines = fileContent(path)
      .split("\n")
      .filter((line) => !/^\s*#/.test(line));
    expect(activeLines.filter((line) => /line/i.test(line) && !/^\s*$/.test(line))).toEqual([]);
  });

  it("送信の実装は SimulatedSender のみ", () => {
    const implementations = Object.entries(sourceFiles)
      .filter(([, content]) => /implements\s+ReminderSender\b/.test(content))
      .map(([path]) => path);
    expect(implementations).toEqual(["src/adapters/sender/SimulatedSender.ts"]);
  });

  it("SimulatedSender は外部と通信しない（fetch を含まない）", () => {
    expect(fileContent("src/adapters/sender/SimulatedSender.ts")).not.toMatch(/\bfetch\b/);
  });
});
