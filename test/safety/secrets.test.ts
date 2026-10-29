import { describe, expect, it } from "vitest";
import { fileContent, repoFiles } from "./repoFiles";

// gitleaks の代わりにリポジトリ内で完結する簡易スキャン（ファイル単位）
const SECRET_PATTERNS: [string, RegExp][] = [
  ["PEM 秘密鍵（本体付き）", /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\n|\r?\n)[A-Za-z0-9+/=]{40,}/],
  ["Google サービスアカウント JSON", /"type"\s*:\s*"service_account"|"private_key_id"\s*:\s*"[0-9a-f]{20,}"/],
  ["Google API キー", /AIza[0-9A-Za-z_-]{35}/],
  ["Google OAuth クライアントシークレット", /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ["Google OAuth トークン", /ya29\.[0-9A-Za-z_-]{20,}/],
  ["AWS アクセスキー", /AKIA[0-9A-Z]{16}/],
  ["GitHub トークン", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["Slack トークン", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["長い Base64 トークン（LINE チャネルアクセストークン等）", /[A-Za-z0-9+/]{120,}={0,2}/],
];

const EMAIL = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
// 例示用（RFC 2606）とプレースホルダのみ許可
const ALLOWED_EMAIL = [
  /@example\.(?:com|org|net)$/,
  /^(?:test|x+)@group\.calendar\.google\.com$/,
  /^reminder-test@your-project\.iam\.gserviceaccount\.com$/,
];
// 前後に英数字・ハイフンが続くもの（UUID などの識別子の一部）は除く
const PHONE = [/(?<![\w-])0\d{1,4}-\d{1,4}-\d{4}(?![\w-])/, /(?<![\w-])0[5789]0\d{8}(?![\w-])/, /\+81[-\s]?\d/];

describe("検査パターン自体が機能すること", () => {
  // 実際のシークレットをファイルに書かないよう、検出用サンプルは実行時に組み立てる
  const samples: Record<string, string> = {
    "PEM 秘密鍵（本体付き）": `-----BEGIN ${"PRIVATE"} KEY-----\n${"M".repeat(64)}`,
    "Google サービスアカウント JSON": `{"type": "${"service"}_account"}`,
    "Google API キー": `AI${"za"}${"x".repeat(35)}`,
    "Google OAuth クライアントシークレット": `GOC${"SPX"}-${"a".repeat(28)}`,
    "Google OAuth トークン": `ya${"29"}.${"a".repeat(40)}`,
    "AWS アクセスキー": `AK${"IA"}${"A".repeat(16)}`,
    "GitHub トークン": `gh${"p"}_${"a".repeat(36)}`,
    "Slack トークン": `xo${"xb"}-${"1".repeat(12)}`,
    "長い Base64 トークン（LINE チャネルアクセストークン等）": `${"Ab9+/".repeat(30)}=`,
  };

  it.each(SECRET_PATTERNS)("%s のサンプルを検出できる", (label, pattern) => {
    expect(samples[label], label).toBeDefined();
    expect(pattern.test(samples[label]!)).toBe(true);
  });

  it("例示用でないメールアドレスを検出できる", () => {
    const found = `contact: someone@${"real-salon"}.jp`.match(EMAIL) ?? [];
    expect(found.filter((m) => !ALLOWED_EMAIL.some((p) => p.test(m)))).toHaveLength(1);
  });
});

describe("シークレットを含まないこと", () => {
  it("スキャン対象が読み込めている", () => {
    expect(Object.keys(repoFiles)).toEqual(
      expect.arrayContaining(["src/index.ts", "wrangler.toml", "package.json", ".dev.vars.example", "fixtures/customers.json"]),
    );
  });

  it.each(SECRET_PATTERNS)("%s がない", (_label, pattern) => {
    const hits = Object.entries(repoFiles)
      .filter(([, content]) => pattern.test(content))
      .map(([path]) => path);
    expect(hits).toEqual([]);
  });

  it(".gitignore が秘密情報・ローカル状態を除外している", () => {
    const ignored = fileContent(".gitignore").split("\n").map((l) => l.trim());
    expect(ignored).toEqual(
      expect.arrayContaining([".dev.vars", "*.pem", "*service-account*.json", ".env", ".env.*", ".wrangler/", "node_modules/"]),
    );
    expect(ignored).toContain("!.dev.vars.example");
  });
});

describe("実在の個人情報を含まないこと（架空データのみ）", () => {
  it("メールアドレスは例示用ドメインかプレースホルダのみ", () => {
    const hits = Object.entries(repoFiles).flatMap(([path, content]) =>
      (content.match(EMAIL) ?? []).filter((m) => !ALLOWED_EMAIL.some((p) => p.test(m))).map((m) => `${path}: ${m}`),
    );
    expect(hits).toEqual([]);
  });

  it("電話番号らしき文字列がない", () => {
    const hits = Object.entries(repoFiles)
      .filter(([, content]) => PHONE.some((p) => p.test(content)))
      .map(([path]) => path);
    expect(hits).toEqual([]);
  });

  it("Fixture は架空データであることを明記し、氏名・カナ以外の個人情報項目を持たない", () => {
    const fixture = JSON.parse(fileContent("fixtures/customers.json")) as { _note: string; customers: object[] };
    expect(fixture._note).toContain("架空");
    const allowedKeys = new Set(["familyName", "givenName", "familyKana", "givenKana", "deactivate"]);
    for (const customer of fixture.customers) {
      expect(Object.keys(customer).filter((k) => !allowedKeys.has(k))).toEqual([]);
    }
    expect((JSON.parse(fileContent("fixtures/events.json")) as { _note: string })._note).toContain("架空");
  });
});
