import type { Child, FC } from "hono/jsx";

export const FLASH_MESSAGES = {
  created: "顧客を登録しました。",
  updated: "顧客情報を更新しました。",
  deactivated: "顧客を論理削除しました。カルテ番号は欠番として残ります。",
  judged: "手動判定を実行しました。",
} as const;
export type FlashCode = keyof typeof FLASH_MESSAGES;

export function flashOf(code: string | undefined): string | undefined {
  return code && code in FLASH_MESSAGES ? FLASH_MESSAGES[code as FlashCode] : undefined;
}

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/judgments", label: "判定結果" },
  { href: "/send-logs", label: "送信ログ" },
  { href: "/customers", label: "顧客マスタ" },
  { href: "/judge", label: "手動判定" },
] as const;

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1f2328;--muted:#5b636e;--line:#d8dde3;--accent:#1f6feb;
--ok:#1a7f37;--ok-bg:#dafbe1;--warn:#9a6700;--warn-bg:#fff8c5;--ng:#cf222e;--ng-bg:#ffebe9;--gray-bg:#eef1f4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);
font:15px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
.banner{background:#6f42c1;color:#fff;text-align:center;padding:6px 16px;font-weight:600;font-size:14px}
header{background:var(--card);border-bottom:1px solid var(--line)}
nav{max-width:1080px;margin:0 auto;padding:0 16px;display:flex;flex-wrap:wrap;gap:4px 16px}
nav a{display:block;padding:10px 0;color:var(--muted);text-decoration:none;border-bottom:2px solid transparent}
nav a[aria-current=page]{color:var(--text);border-color:var(--accent);font-weight:600}
main{max-width:1080px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0 0 16px}h2{font-size:17px;margin:28px 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.stat .label{color:var(--muted);font-size:13px}.stat .value{font-size:24px;font-weight:700}
.table-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:var(--gray-bg);font-size:13px;color:var(--muted);white-space:nowrap}tr:last-child td{border-bottom:0}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.b-ok{background:var(--ok-bg);color:var(--ok)}.b-warn{background:var(--warn-bg);color:var(--warn)}
.b-ng{background:var(--ng-bg);color:var(--ng)}.b-gray{background:var(--gray-bg);color:var(--muted)}
.alert{border-radius:8px;padding:10px 14px;margin:0 0 12px;border:1px solid}
.alert-warn{background:var(--warn-bg);border-color:#d4a72c;color:#4d2d00}
.alert-ng{background:var(--ng-bg);border-color:#ff8182;color:#82071e}
.alert-ok{background:var(--ok-bg);border-color:#4ac26b;color:#044f1e}
.muted{color:var(--muted);font-size:13px}.mono{font-family:ui-monospace,Menlo,monospace}
form.inline{display:inline}label{display:block;font-weight:600;margin:12px 0 4px}
input[type=text],input[type=date],input[type=month]{width:100%;max-width:320px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit}
.field-error{color:var(--ng);font-size:13px;margin-top:2px}
button,.button{display:inline-block;padding:7px 14px;border-radius:6px;border:1px solid var(--line);
background:var(--card);color:var(--text);font:inherit;cursor:pointer;text-decoration:none}
.primary{background:var(--accent);border-color:var(--accent);color:#fff}.danger{color:var(--ng);border-color:#ff8182}
.small{padding:2px 8px;font-size:13px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.toolbar{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-bottom:12px}
.toolbar label{margin:0}
`;

// 表示名のコピーボタン（data-copy の値をクリップボードへ）
const COPY_SCRIPT = `document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;
navigator.clipboard.writeText(b.dataset.copy).then(function(){var t=b.textContent;b.textContent="コピーしました";
setTimeout(function(){b.textContent=t},1200)})});`;

export const Layout: FC<{ title: string; path: string; nonce: string | undefined; flash?: string | undefined; children?: Child }> = ({
  title,
  path,
  nonce,
  flash,
  children,
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{`${title} | 予約リマインダー`}</title>
      {/* CSS・スクリプトは固定文字列のみ（ユーザー入力を含めない） */}
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <div class="banner" role="status">
        シミュレーションモード ／ 架空データ — LINE への送信は行われません
      </div>
      <header>
        <nav aria-label="メインメニュー">
          {NAV.map((n) => (
            <a href={n.href} aria-current={n.href === path ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <h1>{title}</h1>
        {flash && <p class="alert alert-ok">{flash}</p>}
        {children}
      </main>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: COPY_SCRIPT }} />
    </body>
  </html>
);

export const CopyButton: FC<{ value: string }> = ({ value }) => (
  <button type="button" class="small" data-copy={value} aria-label={`${value} をコピー`}>
    コピー
  </button>
);
