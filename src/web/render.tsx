import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { flashOf, Layout } from "./pages/Layout";
import type { AppEnv } from "./types";

export function render(
  c: Context<AppEnv>,
  { title, path, body, status = 200 }: { title: string; path: string; body: Child; status?: ContentfulStatusCode },
) {
  return c.html(
    <Layout title={title} path={path} nonce={c.get("secureHeadersNonce")} flash={flashOf(c.req.query("msg"))}>
      {body}
    </Layout>,
    status,
  );
}

/** フォームの文字列フィールドを取り出す（ファイルや未指定は空文字） */
export function field(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === "string" ? value : "";
}
