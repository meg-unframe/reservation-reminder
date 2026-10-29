import type { FC } from "hono/jsx";
import type { Dashboard } from "../../usecases/adminViews";
import { formatDate, formatDateTime, RUN_STATUS_LABEL, TRIGGER_LABEL } from "../format";

export const DashboardPage: FC<{ data: Dashboard }> = ({ data }) => {
  const { tomorrow, tomorrowRun, tomorrowCounts: counts, monthly } = data;
  return (
    <>
      {data.failedDates.map((date) => (
        <p class="alert alert-ng">
          {formatDate(date)}分の判定が失敗したままです。<a href={`/judgments?date=${date}`}>実行記録を確認</a>し、
          必要なら<a href={`/judge?date=${date}`}>手動判定</a>してください。
        </p>
      ))}
      {monthly.warn && (
        <p class="alert alert-warn">
          今月の送信数が {monthly.sent} / {monthly.limit} 通です（無料枠の {Math.round((monthly.sent / monthly.limit) * 100)}%）。
        </p>
      )}
      {data.karteNo.nearLimit && (
        <p class="alert alert-warn">カルテ番号が上限（9999）に近づいています（現在の最大: {data.karteNo.max}）。</p>
      )}
      {counts && counts.titleOutdated > 0 && (
        <p class="alert alert-warn">
          明日の予約に旧表示名のタイトルが {counts.titleOutdated} 件あります。
          <a href={`/judgments?date=${tomorrow}`}>判定結果</a>からカレンダーのタイトルを修正してください。
        </p>
      )}

      <section class="grid" aria-label="明日の概要">
        <div class="card stat">
          <div class="label">明日 {formatDate(tomorrow)} の判定</div>
          <div class="value">{tomorrowRun ? RUN_STATUS_LABEL[tomorrowRun.status] : "判定前"}</div>
          <div class="muted">
            {tomorrowRun
              ? `${TRIGGER_LABEL[tomorrowRun.trigger]}・${formatDateTime(tomorrowRun.startedAt)}`
              : "毎日 18:00 に自動判定します"}
          </div>
        </div>
        <div class="card stat">
          <div class="label">通知対象 / 要確認 / 対象外</div>
          <div class="value">{counts ? `${counts.notify} / ${counts.review} / ${counts.excluded}` : "—"}</div>
          <div class="muted">
            <a href={`/judgments?date=${tomorrow}`}>判定結果を見る</a>
          </div>
        </div>
        <div class="card stat">
          <div class="label">今月の送信数（シミュレーション）</div>
          <div class="value">
            {monthly.sent} <span class="muted">/ {monthly.limit} 通</span>
          </div>
          <div class="muted">LINE 無料枠の目安。80% で警告します</div>
        </div>
      </section>

      <h2>表示名が変わった顧客（30日以内）</h2>
      {data.recentDisplayNameChanges.length === 0 ? (
        <p class="muted">ありません。</p>
      ) : (
        <>
          <p class="muted">カレンダーの予約タイトルを新しい表示名に直してください。</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>カルテ番号</th>
                  <th>変更前</th>
                  <th>変更後</th>
                  <th>変更日時</th>
                </tr>
              </thead>
              <tbody>
                {data.recentDisplayNameChanges.map((c) => (
                  <tr>
                    <td class="mono">
                      <a href={`/customers/${c.karteNo}`}>{c.karteNo}</a>
                    </td>
                    <td>{c.before}</td>
                    <td>{c.after ?? <span class="badge b-gray">論理削除</span>}</td>
                    <td>{formatDateTime(c.changedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};
