import type { AccessTokenProvider } from "../../ports/AccessTokenProvider";

/** 環境変数で渡された短時間トークンをそのまま返す（ローカル開発専用。期限切れは API が 401 を返す） */
export class StaticAccessTokenProvider implements AccessTokenProvider {
  constructor(private readonly token: string) {}

  async getAccessToken(): Promise<string> {
    return this.token;
  }
}
