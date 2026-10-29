// `cloudflare:workers` の env / exports に本プロジェクトの型を与える
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./index");
  }
  interface Env extends import("./config").Env {}
}
