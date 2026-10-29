// `cloudflare:workers` の env / exports に本プロジェクトの型を与える
declare namespace Cloudflare {
  type AppEnv = import("./config").Env;
  interface GlobalProps {
    mainModule: typeof import("./index");
  }
  interface Env extends AppEnv {}
}
