import type { FC } from "hono/jsx";
import type { DisplayNameChange } from "../../domain/displayName";
import type { DisplayNameHistoryEntry } from "../../ports/CustomerRepository";
import type { CustomerRow } from "../../usecases/adminViews";
import type { CustomerInput } from "../../usecases/customers";
import { formatDateTime } from "../format";
import { CopyButton } from "./Layout";

const StatusBadge: FC<{ row: CustomerRow }> = ({ row }) =>
  row.status === "active" ? <span class="badge b-ok">有効</span> : <span class="badge b-gray">論理削除</span>;

export const CustomersPage: FC<{ rows: CustomerRow[]; nearLimit: boolean }> = ({ rows, nearLimit }) => (
  <>
    {nearLimit && <p class="alert alert-warn">カルテ番号が上限（9999）に近づいています。</p>}
    <p class="muted">
      予約タイトルには「表示名」をそのまま使ってください。同姓の顧客がいると、既存の顧客も含めて名前の頭文字が付きます。
    </p>
    <div class="toolbar">
      <a class="button primary" href="/customers/new">
        顧客を登録
      </a>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>カルテ番号</th>
            <th>表示名</th>
            <th>氏名</th>
            <th>フリガナ</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr>
              <td class="mono">
                <a href={`/customers/${row.karteNo}`}>{row.karteNo}</a>
              </td>
              <td>
                {row.displayName ? (
                  <>
                    {row.displayName} <CopyButton value={row.displayName} />
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {row.familyName} {row.givenName}
              </td>
              <td>
                {row.familyKana} {row.givenKana}
              </td>
              <td>
                <StatusBadge row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

type FieldErrors = Partial<Record<keyof CustomerInput, string>>;

const FIELDS: { name: keyof CustomerInput; label: string; required: boolean }[] = [
  { name: "familyName", label: "姓", required: true },
  { name: "givenName", label: "名", required: true },
  { name: "familyKana", label: "セイ", required: false },
  { name: "givenKana", label: "メイ", required: false },
];

export const CustomerForm: FC<{
  action: string;
  values: Partial<CustomerInput>;
  errors?: FieldErrors | undefined;
  submitLabel: string;
}> = ({ action, values, errors = {}, submitLabel }) => (
  <form method="post" action={action} class="card" novalidate>
    {FIELDS.map((f) => (
      <div>
        <label for={f.name}>
          {f.label}
          {f.required && <span class="muted">（必須）</span>}
        </label>
        <input
          type="text"
          id={f.name}
          name={f.name}
          value={values[f.name] ?? ""}
          maxlength={30}
          required={f.required}
          aria-invalid={errors[f.name] ? "true" : undefined}
          aria-describedby={errors[f.name] ? `${f.name}-error` : undefined}
        />
        {errors[f.name] && (
          <div class="field-error" id={`${f.name}-error`}>
            {errors[f.name]}
          </div>
        )}
      </div>
    ))}
    <p class="muted">カルテ番号は登録時に自動で採番され、あとから変更できません。</p>
    <div class="actions">
      <button type="submit" class="primary">
        {submitLabel}
      </button>
      <a class="button" href="/customers">
        キャンセル
      </a>
    </div>
  </form>
);

/** 他の顧客の表示名も変わる操作の確認画面 */
export const ConfirmImpact: FC<{
  action: string;
  message: string;
  changes: DisplayNameChange[];
  hidden: Record<string, string>;
  submitLabel: string;
  danger?: boolean;
  cancelHref: string;
}> = ({ action, message, changes, hidden, submitLabel, danger, cancelHref }) => (
  <form method="post" action={action} class="card">
    <p class="alert alert-warn">{message}</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>カルテ番号</th>
            <th>変更前</th>
            <th>変更後</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr>
              <td class="mono">{c.karteNo}</td>
              <td>{c.before ?? <span class="badge b-gray">新規</span>}</td>
              <td>{c.after ?? <span class="badge b-gray">論理削除</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p class="muted">変更後は、該当する予約のカレンダータイトルを新しい表示名に直してください。</p>
    {Object.entries(hidden).map(([name, value]) => (
      <input type="hidden" name={name} value={value} />
    ))}
    <input type="hidden" name="confirm" value="1" />
    <div class="actions">
      <button type="submit" class={danger ? "danger" : "primary"}>
        {submitLabel}
      </button>
      <a class="button" href={cancelHref}>
        キャンセル
      </a>
    </div>
  </form>
);

export const CustomerDetailPage: FC<{
  customer: CustomerRow;
  history: DisplayNameHistoryEntry[];
  errors?: FieldErrors | undefined;
  values?: Partial<CustomerInput> | undefined;
}> = ({ customer, history, errors, values }) => (
  <>
    <section class="card">
      <div class="grid">
        <div class="stat">
          <div class="label">カルテ番号（変更不可）</div>
          <div class="value mono">{customer.karteNo}</div>
        </div>
        <div class="stat">
          <div class="label">表示名</div>
          <div class="value">{customer.displayName ?? "—"}</div>
          {customer.displayName && <CopyButton value={customer.displayName} />}
        </div>
        <div class="stat">
          <div class="label">状態</div>
          <div class="value">
            <StatusBadge row={customer} />
          </div>
        </div>
      </div>
    </section>

    {customer.status === "active" && (
      <>
        <h2>氏名の編集</h2>
        <CustomerForm
          action={`/customers/${customer.karteNo}`}
          values={values ?? customer}
          errors={errors}
          submitLabel="更新する"
        />
      </>
    )}

    <h2>表示名の履歴</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>表示名</th>
            <th>開始</th>
            <th>終了</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr>
              <td>{h.displayName}</td>
              <td>{formatDateTime(h.validFrom)}</td>
              <td>{h.validTo ? formatDateTime(h.validTo) : <span class="badge b-ok">現行</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {customer.status === "active" && (
      <>
        <h2>論理削除</h2>
        <form method="post" action={`/customers/${customer.karteNo}/deactivate`} class="card">
          <p class="muted">
            論理削除すると判定の対象外（要確認）になります。カルテ番号は欠番として残り、再利用されません。元に戻す操作はありません。
          </p>
          <button type="submit" class="danger">
            論理削除する
          </button>
        </form>
      </>
    )}
  </>
);
