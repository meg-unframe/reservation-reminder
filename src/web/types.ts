import type { SecureHeadersVariables } from "hono/secure-headers";
import type { AppConfig, Env } from "../config";

export type AppEnv = {
  Bindings: Env;
  Variables: { config: AppConfig } & SecureHeadersVariables;
};
