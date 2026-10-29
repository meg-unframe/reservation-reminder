import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Worker 起動確認", () => {
  it("/healthz がシミュレーションモードで応答する", async () => {
    const res = await exports.default.fetch("http://localhost/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sendMode: "simulation" });
  });
});
