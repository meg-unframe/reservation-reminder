export interface RetryOptions {
  /** 初回失敗後の再試行回数 */
  retries: number;
  /** 1回目の待機（以降 2倍ずつ増やす） */
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

/** 再試行しても結果が変わらないエラー（認証失敗など）。withRetry はすぐに投げ直す */
export class NonRetryableError extends Error {
  override name = "NonRetryableError";
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 指数バックオフで再試行する（既定: 1s → 2s → 4s の最大3回） */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, baseDelayMs, sleep = defaultSleep, onRetry } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || e instanceof NonRetryableError) throw e;
      onRetry?.(attempt + 1, e);
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}
