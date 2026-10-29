import type { FC } from "hono/jsx";
import type { JudgmentResult } from "../../domain/classify";
import type { JudgmentRow, JudgmentView } from "../../usecases/adminViews";
import { formatDate, formatDateTime, formatTime, REASON_LABEL, RESULT_LABEL, RUN_STATUS_LABEL, TRIGGER_LABEL } from "../format";
import { CopyButton } from "./Layout";

const RESULT_CLASS: Record<JudgmentResult, string> = { notify: "b-ok", review: "b-warn", excluded: "b-gray" };

const Row: FC<{ row: JudgmentRow }> = ({ row }) => (
  <tr>
    <td class="mono">{row.event.allDay ? "終日" : formatTime(row.event.startAt)}</td>
    <td>
      {row.event.title}
      {row.warning === "title_outdated" && row.currentDisplayName && (
        <div class="muted">
          正しいタイトル: {row.currentDisplayName} <CopyButton value={row.currentDisplayName} />
        </div>
      )}
    </td>
    <td>
      <span class={`badge ${RESULT_CLASS[row.result]}`}>{RESULT_LABEL[row.result]}</span>
      <div class="muted">{REASON_LABEL[row.reason]}</div>
    </td>
    <td class="mono">{row.karteNo ? <a href={`/customers/${row.karteNo}`}>{row.karteNo}</a> : "—"}</td>
    <td>{row.menu ?? "—"}</td>
    <td>{row.sendLog ? row.sendLog.body : row.result === "notify" ? <span class="muted">未記録</span> : "—"}</td>
  </tr>
);

export const JudgmentPage: FC<{ view: JudgmentView }> = ({ view }) => {
  const review = view.rows.filter((r) => r.result === "review").length;
  return (
    <>
      <form method="get" action="/judgments" class="toolbar">
        <div>
          <label for="date">対象日</label>
          <input type="date" id="date" name="date" value={view.date} required />
        </div>
        <button type="submit">表示</button>
        <a class="button" href={`/judge?date=${view.date}`}>
          この日を手動判定
        </a>
      </form>

      <p class="muted">{formatDate(view.date)}の予約（18:00 判定時点のスナップショット）</p>
      {review > 0 && (
        <p class="alert alert-warn">要確認の予約が {review} 件あります。カレンダーのタイトルか顧客マスタを確認してください。</p>
      )}

      {view.runs.length === 0 ? (
        <p class="card">この日はまだ判定されていません。</p>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>時刻</th>
                <th>予約タイトル</th>
                <th>判定</th>
                <th>カルテ番号</th>
                <th>メニュー</th>
                <th>送信内容（シミュレーション）</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <Row row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>実行記録</h2>
      {view.runs.length === 0 ? (
        <p class="muted">ありません。</p>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>種別</th>
                <th>状態</th>
                <th>開始</th>
                <th>終了</th>
                <th>エラー</th>
              </tr>
            </thead>
            <tbody>
              {view.runs.map((run) => (
                <tr>
                  <td class="mono">{run.id}</td>
                  <td>{TRIGGER_LABEL[run.trigger]}</td>
                  <td>
                    <span class={`badge ${run.status === "success" ? "b-ok" : run.status === "failed" ? "b-ng" : "b-gray"}`}>
                      {RUN_STATUS_LABEL[run.status]}
                    </span>
                  </td>
                  <td>{formatDateTime(run.startedAt)}</td>
                  <td>{run.finishedAt ? formatDateTime(run.finishedAt) : "—"}</td>
                  <td class="mono">{run.errorCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
