import type { FC } from "hono/jsx";
import type { ChangeKind, EventSnapshot } from "../../domain/diff";
import type { ChangeRow, ChangesView } from "../../usecases/detectPostJudgmentChanges";
import { formatDate, formatDateTime, formatTime, TRIGGER_LABEL } from "../format";

const KIND: Record<ChangeKind, { label: string; class: string; hint: string }> = {
  added: { label: "追加", class: "b-warn", hint: "判定後に追加された予約です。リマインダーは送信されていません。" },
  changed: { label: "変更", class: "b-warn", hint: "判定後に時刻・タイトルが変わりました。送信済みの内容が古くなっています。" },
  removed: { label: "削除", class: "b-ng", hint: "判定後にキャンセル・削除されました。リマインダーは送信済みです。" },
};

const When: FC<{ e: EventSnapshot | undefined }> = ({ e }) =>
  e ? (
    <>
      <span class="mono">
        {formatTime(e.startAt)}〜{formatTime(e.endAt)}
      </span>{" "}
      {e.title}
      {e.cancelled && <span class="badge b-gray">キャンセル</span>}
    </>
  ) : (
    <span class="muted">—</span>
  );

const ChangeTable: FC<{ date: string; rows: ChangeRow[]; ackable: boolean }> = ({ date, rows, ackable }) => (
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>種別</th>
          <th>判定時点</th>
          <th>現在</th>
          <th>{ackable ? "操作" : "状態"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            <td>
              <span class={`badge ${KIND[row.kind].class}`}>{KIND[row.kind].label}</span>
              <div class="muted">{KIND[row.kind].hint}</div>
            </td>
            <td>
              <When e={row.before} />
            </td>
            <td>
              <When e={row.after} />
            </td>
            <td>
              {ackable ? (
                <form method="post" action="/changes/ack" class="inline">
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="fingerprint" value={row.fingerprint} />
                  <button type="submit" class="small">
                    確認済みにする
                  </button>
                </form>
              ) : (
                <span class="badge b-ok">確認済み</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ChangesPage: FC<{ date: string; view: ChangesView | undefined }> = ({ date, view }) => {
  const pending = view?.judged ? view.changes.filter((c) => !c.acked) : [];
  const acked = view?.judged ? view.changes.filter((c) => c.acked) : [];
  return (
    <>
      <form method="get" action="/changes" class="toolbar">
        <div>
          <label for="date">対象日</label>
          <input type="date" id="date" name="date" value={date} required />
        </div>
        <button type="submit">表示</button>
      </form>

      {!view ? (
        <p class="alert alert-ng">カレンダーの取得に失敗しました。時間をおいて再表示してください。</p>
      ) : !view.judged ? (
        <p class="card">{formatDate(date)}はまだ判定されていません。</p>
      ) : (
        <>
          <p class="muted">
            {formatDate(date)}の予約を、最新の判定（{TRIGGER_LABEL[view.latestRun.trigger]}・
            {formatDateTime(view.latestRun.startedAt)}）時点と現在のカレンダーで比較しています。自動での再送信は行いません。
          </p>
          <h2>未確認（{pending.length}件）</h2>
          {pending.length === 0 ? <p class="muted">ありません。</p> : <ChangeTable date={date} rows={pending} ackable />}
          {acked.length > 0 && (
            <>
              <h2>確認済み（{acked.length}件）</h2>
              <ChangeTable date={date} rows={acked} ackable={false} />
            </>
          )}
        </>
      )}
    </>
  );
};
