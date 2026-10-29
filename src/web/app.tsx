import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { loadConfig } from "../config";
import { createCalendarSource, createChangeDeps, createCustomerDeps, createJudgmentDeps, createReadDeps } from "../container";
import { isValidDateString, toJstMonthKey, tomorrowInJst } from "../domain/jstDate";
import { consoleLogger, errorCodeOf } from "../lib/logger";
import type { CalendarSource } from "../ports/CalendarSource";
import { getDashboard, getJudgmentView, getMonthlyUsage } from "../usecases/adminViews";
import {
  acknowledgeChange,
  detectPostJudgmentChanges,
  type ChangesView,
  UnknownChangeError,
  unackedCount,
} from "../usecases/detectPostJudgmentChanges";
import { runDailyJudgment } from "../usecases/runDailyJudgment";
import { seedFixtureCustomers } from "../usecases/seedFixtureCustomers";
import { accessAuth, type AccessAuthOptions } from "./middleware/accessAuth";
import { ChangesPage } from "./pages/Changes";
import { DashboardPage, type PendingChanges } from "./pages/Dashboard";
import { JudgmentPage } from "./pages/Judgment";
import { ManualJudgePage } from "./pages/ManualJudge";
import { SendLogsPage } from "./pages/SendLogs";
import { field, render } from "./render";
import { customerRoutes } from "./routes/customers";
import type { AppEnv } from "./types";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export interface AppOptions {
  access?: AccessAuthOptions;
  /** テスト用: 予約の取得元を差し替える（既定は設定に従う） */
  calendar?: CalendarSource;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const calendarOf = (c: Context<AppEnv>) => options.calendar ?? createCalendarSource(c.var.config);

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        styleSrc: [NONCE],
        scriptSrc: [NONCE],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
      referrerPolicy: "no-referrer",
    }),
  );
  // 設定が不正なら全リクエストを拒否する（送信モードの安全装置）
  app.use(async (c, next) => {
    c.set("config", loadConfig(c.env));
    await next();
  });

  app.get("/healthz", (c) => c.json({ ok: true, sendMode: "simulation" }));

  // ローカル開発専用: 架空顧客の投入
  app.post("/dev/seed", async (c) => {
    if (c.var.config.environment !== "local") return c.notFound();
    return c.json(await seedFixtureCustomers(createCustomerDeps(c.env)));
  });

  // ここから下は管理画面（Cloudflare Access 認証 + CSRF 対策）
  app.use(accessAuth(options.access));
  app.use(csrf());

  app.get("/", async (c) => {
    const data = await getDashboard(createReadDeps(c.env));
    let pendingChanges: PendingChanges;
    try {
      pendingChanges = unackedCount(await detectPostJudgmentChanges(createChangeDeps(c.env, calendarOf(c)), data.tomorrow));
    } catch (e) {
      // カレンダー取得の失敗でダッシュボード全体を止めない
      consoleLogger.error("dashboard.changes_failed", { errorCode: errorCodeOf(e) });
      pendingChanges = "error";
    }
    return render(c, { title: "ダッシュボード", path: "/", body: <DashboardPage data={data} pendingChanges={pendingChanges} /> });
  });

  app.get("/judgments", async (c) => {
    const deps = createReadDeps(c.env);
    const q = c.req.query("date");
    const date = q && isValidDateString(q) ? q : tomorrowInJst(deps.clock.now());
    return render(c, { title: "判定結果", path: "/judgments", body: <JudgmentPage view={await getJudgmentView(deps, date)} /> });
  });

  app.get("/changes", async (c) => {
    const q = c.req.query("date");
    const date = q && isValidDateString(q) ? q : tomorrowInJst(new Date());
    let view: ChangesView | undefined;
    try {
      view = await detectPostJudgmentChanges(createChangeDeps(c.env, calendarOf(c)), date);
    } catch (e) {
      consoleLogger.error("changes.failed", { targetDate: date, errorCode: errorCodeOf(e) });
    }
    return render(c, { title: "判定後の変更", path: "/changes", body: <ChangesPage date={date} view={view} /> });
  });

  app.post("/changes/ack", async (c) => {
    const body = await c.req.parseBody();
    const date = field(body, "date");
    if (!isValidDateString(date)) return c.text("対象日が不正です", 422);
    try {
      await acknowledgeChange(createChangeDeps(c.env, calendarOf(c)), date, field(body, "fingerprint"));
    } catch (e) {
      // 既に内容が変わった・存在しない変更は記録しない
      if (e instanceof UnknownChangeError) return c.text("指定された変更は現在の差分にありません。画面を再読み込みしてください。", 409);
      throw e;
    }
    return c.redirect(`/changes?date=${date}&msg=acked`, 303);
  });

  app.get("/send-logs", async (c) => {
    const deps = createReadDeps(c.env);
    const q = c.req.query("month");
    const monthKey = q && MONTH_PATTERN.test(q) && isValidDateString(`${q}-01`) ? q : toJstMonthKey(deps.clock.now());
    const [usage, logs] = await Promise.all([
      getMonthlyUsage(deps.sendLogs, monthKey),
      deps.sendLogs.list({ monthKey, limit: 500 }),
    ]);
    return render(c, { title: "送信ログ", path: "/send-logs", body: <SendLogsPage usage={usage} logs={logs} /> });
  });

  app.get("/judge", (c) => {
    const q = c.req.query("date");
    const date = q && isValidDateString(q) ? q : tomorrowInJst(new Date());
    return render(c, { title: "手動判定", path: "/judge", body: <ManualJudgePage date={date} /> });
  });

  app.post("/judge", async (c) => {
    const date = field(await c.req.parseBody(), "date");
    if (!isValidDateString(date)) {
      return render(c, {
        title: "手動判定",
        path: "/judge",
        status: 422,
        body: <ManualJudgePage date={tomorrowInJst(new Date())} error="対象日を正しく指定してください。" />,
      });
    }
    try {
      await runDailyJudgment(createJudgmentDeps(c.env, c.var.config, calendarOf(c)), { targetDate: date, trigger: "manual" });
    } catch {
      return render(c, {
        title: "手動判定",
        path: "/judge",
        status: 502,
        body: <ManualJudgePage date={date} error="判定に失敗しました。実行記録を確認し、時間をおいて再実行してください。" />,
      });
    }
    return c.redirect(`/judgments?date=${date}&msg=judged`, 303);
  });

  app.route("/customers", customerRoutes);

  app.notFound((c) => c.text("Not Found", 404));
  // エラー詳細（設定値・個人情報を含みうる）は応答にもログにも出さない
  app.onError((err, c) => {
    // CSRF 拒否（403）などミドルウェアが意図して返すエラーはそのまま返す
    if (err instanceof HTTPException) return err.getResponse();
    consoleLogger.error("http.error", { errorCode: errorCodeOf(err) });
    return c.text("エラーが発生しました", 500);
  });

  return app;
}
