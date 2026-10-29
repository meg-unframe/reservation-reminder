/**
 * 構造化ログ。個人情報を出さないよう、出力できる項目を型で限定する
 * （顧客の識別はカルテ番号のみ。氏名・表示名・本文・予定タイトルは渡せない）。
 */
export interface LogFields {
  targetDate?: string;
  runId?: number;
  trigger?: string;
  karteNo?: string;
  eventId?: string;
  attempt?: number;
  errorCode?: string;
  counts?: Record<string, number>;
}

export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export const consoleLogger: Logger = {
  info: (event, fields) => console.log(JSON.stringify({ level: "info", event, ...fields })),
  error: (event, fields) => console.error(JSON.stringify({ level: "error", event, ...fields })),
};

/** 例外からログに出せる識別子だけを取り出す（メッセージには個人情報が含まれうるため出さない） */
export function errorCodeOf(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
