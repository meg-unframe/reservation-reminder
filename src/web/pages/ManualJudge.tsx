import type { FC } from "hono/jsx";

export const ManualJudgePage: FC<{ date: string; error?: string | undefined }> = ({ date, error }) => (
  <form method="post" action="/judge" class="card">
    {error && <p class="alert alert-ng">{error}</p>}
    <p>指定日の予約をその場で判定し、通知対象の送信をシミュレーションします（検証用）。</p>
    <ul class="muted">
      <li>判定結果のスナップショットはこの日付分が作り直されます。</li>
      <li>送信ログは予約ごとに1回だけ記録されます。判定後に追加・時刻変更された予約は、新たに記録されます。</li>
      <li>手動判定をしても、18:00 の定時判定は通常どおり実行されます。</li>
      <li>LINE への送信は行われません。</li>
    </ul>
    <label for="date">対象日</label>
    <input type="date" id="date" name="date" value={date} required />
    <div class="actions">
      <button type="submit" class="primary">
        判定を実行
      </button>
    </div>
  </form>
);
