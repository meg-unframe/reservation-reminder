/// <reference types="vite/client" />
// テスト専用の型（バインディング・import.meta.glob）

declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
