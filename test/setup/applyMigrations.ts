import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// 適用済みのマイグレーションは記録されるため、各テストファイルで呼んでも二重適用されない
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
