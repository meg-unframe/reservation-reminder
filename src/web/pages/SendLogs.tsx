import type { FC } from "hono/jsx";
import type { MonthlyUsage } from "../../usecases/adminViews";
import type { SendLog } from "../../ports/SendLogRepository";
import { formatDate, formatDateTime, formatTime } from "../format";

export const SendLogsPage: FC<{ usage: MonthlyUsage; logs: SendLog[] }> = ({ usage, logs }) => (
  <>
    <form method="get" action="/send-logs" class="toolbar">
      <div>
        <label for="month">記録した月</label>
        <input type="month" id="month" name="month" value={usage.monthKey} required />
      </div>
      <button type="submit">表示</button>
    </form>

    <p class={usage.warn ? "alert alert-warn" : "muted"}>
      {usage.monthKey.replace("-", "年")}月の送信数: {usage.sent} / {usage.limit} 通（シミュレーション。LINE には送信していません）
    </p>

    {logs.length === 0 ? (
      <p class="card">この月の送信ログはありません。</p>
    ) : (
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>記録日時</th>
              <th>予約</th>
              <th>カルテ番号</th>
              <th>本文</th>
              <th>モード</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr>
                <td>{formatDateTime(log.createdAt)}</td>
                <td>
                  <a href={`/judgments?date=${log.targetDate}`}>{formatDate(log.targetDate)}</a> {formatTime(log.startAt)}
                </td>
                <td class="mono">
                  <a href={`/customers/${log.karteNo}`}>{log.karteNo}</a>
                </td>
                <td>{log.body}</td>
                <td>
                  <span class="badge b-gray">{log.mode}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
);
