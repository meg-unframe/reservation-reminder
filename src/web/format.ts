import type { JudgmentReason, JudgmentResult } from "../domain/classify";
import { toJstIsoString, toJstParts } from "../domain/jstDate";
import type { JudgmentRunStatus, JudgmentTrigger } from "../ports/JudgmentRepository";

export const RESULT_LABEL: Record<JudgmentResult, string> = {
  notify: "通知対象",
  review: "要確認",
  excluded: "対象外",
};

export const REASON_LABEL: Record<JudgmentReason, string> = {
  matched: "表示名と一致",
  matched_past_name: "旧表示名と一致（タイトル要修正）",
  unknown_karte_no: "未登録のカルテ番号",
  inactive_customer: "論理削除済みの顧客",
  name_mismatch: "番号と名前（敬称）が一致しない",
  cancelled: "キャンセル済み",
  all_day: "終日予定",
  not_reservation: "カルテ番号なし（私用）",
};

export const TRIGGER_LABEL: Record<JudgmentTrigger, string> = {
  cron: "定時（18:00）",
  cron_retry: "定時・保険（18:10）",
  manual: "手動",
};

export const RUN_STATUS_LABEL: Record<JudgmentRunStatus, string> = {
  running: "実行中",
  success: "成功",
  failed: "失敗",
};

/** 2026-10-30 → 10月30日（金） */
export function formatDate(date: string): string {
  const { month, day, weekday } = toJstParts(`${date}T12:00:00+09:00`);
  return `${month}月${day}日（${weekday}）`;
}

/** ISO 日時 → HH:mm（JST） */
export function formatTime(iso: string): string {
  return toJstParts(iso).time;
}

/** ISO 日時 → 2026/10/29 18:00（JST） */
export function formatDateTime(iso: string): string {
  const jst = toJstIsoString(new Date(iso));
  return `${jst.slice(0, 10).replaceAll("-", "/")} ${jst.slice(11, 16)}`;
}
