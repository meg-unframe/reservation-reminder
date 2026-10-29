/**
 * Google API のアクセストークンの取得元。
 * 現在はローカル開発用に、手元で発行した短時間トークン（サービスアカウントの権限借用）を渡すだけ。
 * 本番の認証方式（Workload Identity 連携など）は未決定で、決まったらこのインターフェースの実装を追加する。
 */
export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}
