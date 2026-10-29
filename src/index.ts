import { Hono } from "hono";
import { loadConfig, type Env } from "./config";

const app = new Hono<{ Bindings: Env }>();

// 設定が不正なら全リクエストを拒否する（送信モードの安全装置）
app.use(async (c, next) => {
  loadConfig(c.env);
  await next();
});

app.get("/healthz", (c) => c.json({ ok: true, sendMode: "simulation" }));

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, _ctx) {
    loadConfig(env);
    // 定時判定はステップ4で実装する
  },
} satisfies ExportedHandler<Env>;
