import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { FixtureCalendarSource } from "../../../src/adapters/fixture/FixtureCalendarSource";
import { tomorrowInJst } from "../../../src/domain/jstDate";
import { registerCustomer } from "../../../src/usecases/customers";
import { runDailyJudgment } from "../../../src/usecases/runDailyJudgment";
import { seedFixtureCustomers } from "../../../src/usecases/seedFixtureCustomers";
import { createApp } from "../../../src/web/app";
import { customerDeps, judgmentDeps } from "../../helpers/judgmentDeps";
import { resetDb } from "../../helpers/resetDb";

const ORIGIN = "http://localhost";
const app = createApp();

function get(path: string) {
  return app.fetch(new Request(`${ORIGIN}${path}`), env);
}

function post(path: string, form: Record<string, string>, origin = ORIGIN) {
  return app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
      body: new URLSearchParams(form),
    }),
    env,
  );
}

const customerCount = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM customers").first<number>("n")) ?? 0;

beforeEach(resetDb);

describe("全画面共通", () => {
  it.each(["/", "/judgments", "/send-logs", "/customers", "/customers/new", "/judge"])(
    "%s はシミュレーションのバナーと nonce 付き CSP を返す",
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("シミュレーションモード ／ 架空データ");
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce).toBeTruthy();
      expect(csp).toContain("default-src 'none'");
      expect(html).toContain(`<style nonce="${nonce}">`);
      expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    },
  );

  it("存在しないページは 404", async () => {
    expect((await get("/nope")).status).toBe(404);
    expect((await get("/customers/abcd")).status).toBe(404);
    expect((await get("/customers/0999")).status).toBe(404);
  });
});

describe("ダッシュボード・判定結果・送信ログ（架空データ）", () => {
  const tomorrow = tomorrowInJst(new Date());

  beforeEach(async () => {
    await seedFixtureCustomers(customerDeps());
    await runDailyJudgment(judgmentDeps(new FixtureCalendarSource()), { targetDate: tomorrow, trigger: "cron" });
  });

  it("ダッシュボードに明日の判定件数とタイトル要修正の警告が出る", async () => {
    const html = await (await get("/")).text();
    expect(html).toContain("5 / 4 / 3");
    expect(html).toContain("旧表示名のタイトルが 1 件");
    expect(html).toContain("田中様（0001）"); // 表示名が変わった顧客
  });

  it("判定結果に本文と正しいタイトル（コピー可）が出る", async () => {
    const html = await (await get(`/judgments?date=${tomorrow}`)).text();
    expect(html).toContain("カットのご予約を承っております。");
    expect(html).toContain("要確認の予約が 4 件");
    expect(html).toContain(`data-copy="田中(花)様（0001）"`);
  });

  it("不正な日付クエリは明日にフォールバックする", async () => {
    const html = await (await get("/judgments?date=2026-02-30")).text();
    expect(html).toContain(`value="${tomorrow}"`);
  });

  it("送信ログを月で表示する", async () => {
    const html = await (await get("/send-logs?month=2026-10")).text();
    expect(html).toContain("5 / 200 通");
    expect(html.match(/<span class="badge b-gray">simulation<\/span>/g)).toHaveLength(5);
  });
});

describe("顧客マスタ", () => {
  it("同姓がいなければ確認なしで登録し、詳細へリダイレクトする", async () => {
    const res = await post("/customers", { familyName: "佐藤", givenName: "健" });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/customers/0001?msg=created");
    const html = await (await get("/customers/0001?msg=created")).text();
    expect(html).toContain("顧客を登録しました。");
    expect(html).toContain("佐藤様（0001）");
  });

  it("同姓がいると既存顧客への影響を確認してから登録する", async () => {
    await registerCustomer(customerDeps(), { familyName: "田中", givenName: "花子" });

    const confirm = await post("/customers", { familyName: "田中", givenName: "友子" });
    expect(confirm.status).toBe(200);
    const html = await confirm.text();
    expect(html).toContain("既存の顧客の表示名も変わります");
    expect(html).toContain("田中(花)様（0001）");
    expect(await customerCount()).toBe(1);

    const done = await post("/customers", { familyName: "田中", givenName: "友子", confirm: "1" });
    expect(done.status).toBe(303);
    expect(await customerCount()).toBe(2);
  });

  it("入力エラーは 422 でフォームを再表示し、保存しない", async () => {
    const res = await post("/customers", { familyName: "", givenName: "花子" });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("姓は必須です");
    expect(await customerCount()).toBe(0);
  });

  it("編集と論理削除（確認画面を経由）", async () => {
    await registerCustomer(customerDeps(), { familyName: "田中", givenName: "花子" });
    await registerCustomer(customerDeps(), { familyName: "田中", givenName: "友子" });

    expect((await post("/customers/0002", { familyName: "鈴木", givenName: "友子" })).status).toBe(200); // 確認画面
    expect((await post("/customers/0002", { familyName: "鈴木", givenName: "友子", confirm: "1" })).status).toBe(303);
    expect(await (await get("/customers/0001")).text()).toContain("田中様（0001）");

    const confirm = await post("/customers/0002/deactivate", {});
    expect(await confirm.text()).toContain("論理削除の確認");
    const done = await post("/customers/0002/deactivate", { confirm: "1" });
    expect(done.headers.get("Location")).toBe("/customers/0002?msg=deactivated");
    expect((await post("/customers/0002/deactivate", { confirm: "1" })).status).toBe(404);
  });

  it("入力値は HTML エスケープされる（XSS 対策）", async () => {
    await post("/customers", { familyName: "<script>x</script>", givenName: "花子" });
    const html = await (await get("/customers")).text();
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});

describe("CSRF 対策", () => {
  it("別オリジンからの POST は拒否し、保存しない", async () => {
    const res = await post("/customers", { familyName: "佐藤", givenName: "健" }, "https://evil.example.com");
    expect(res.status).toBe(403);
    expect(await customerCount()).toBe(0);
  });

  it("別オリジンからの手動判定も拒否する", async () => {
    const res = await post("/judge", { date: "2026-10-30" }, "https://evil.example.com");
    expect(res.status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM judgment_runs").first("n")).toBe(0);
  });
});

describe("手動判定", () => {
  it("指定日を判定して判定結果へリダイレクトする", async () => {
    await seedFixtureCustomers(customerDeps());
    const res = await post("/judge", { date: "2026-11-02" });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/judgments?date=2026-11-02&msg=judged");
    const html = await (await get("/judgments?date=2026-11-02&msg=judged")).text();
    expect(html).toContain("手動判定を実行しました。");
    expect(html).toContain("手動");
  });

  it("不正な日付は 422", async () => {
    expect((await post("/judge", { date: "2026-13-01" })).status).toBe(422);
  });
});
