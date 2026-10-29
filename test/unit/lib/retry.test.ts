import { describe, expect, it, vi } from "vitest";
import { NonRetryableError, withRetry } from "../../../src/lib/retry";

describe("withRetry", () => {
  it("失敗が続けば 1s→2s→4s 待って計4回試し、最後のエラーを投げる", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(withRetry(fn, { retries: 3, baseDelayMs: 1000, sleep })).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[1000], [2000], [4000]]);
  });

  it("途中で成功すればその結果を返す", async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw new Error("temporary");
        return "ok";
      },
      { retries: 3, baseDelayMs: 1, sleep: async () => {}, onRetry },
    );
    expect(result).toBe("ok");
    expect(onRetry.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  });
});

describe("withRetry（再試行しないエラー）", () => {
  it("NonRetryableError は待たずにすぐ投げ直す", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw new NonRetryableError("auth");
    });
    await expect(withRetry(fn, { retries: 3, baseDelayMs: 1000, sleep })).rejects.toThrow(NonRetryableError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
