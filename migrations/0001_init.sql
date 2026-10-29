-- 予約リマインダー 初期スキーマ（日時はすべて ISO 8601 文字列）

-- 顧客マスタ。カルテ番号は変更・物理削除・再利用不可（論理削除のみ）
CREATE TABLE customers (
  karte_no    TEXT PRIMARY KEY
              CHECK (length(karte_no) = 4 AND karte_no GLOB '[0-9][0-9][0-9][0-9]' AND karte_no <> '0000'),
  family_name TEXT NOT NULL CHECK (length(trim(family_name)) > 0),
  given_name  TEXT NOT NULL CHECK (length(trim(given_name)) > 0),
  family_kana TEXT NOT NULL DEFAULT '',
  given_kana  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TRIGGER customers_karte_no_immutable
BEFORE UPDATE OF karte_no ON customers
WHEN NEW.karte_no IS NOT OLD.karte_no
BEGIN
  SELECT RAISE(ABORT, 'karte_no is immutable');
END;

CREATE TRIGGER customers_no_delete
BEFORE DELETE ON customers
BEGIN
  SELECT RAISE(ABORT, 'customers cannot be deleted; set status to inactive');
END;

-- 表示名の履歴。valid_to が NULL の行が現行表示名（顧客ごとに最大1行）
CREATE TABLE display_name_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  karte_no     TEXT NOT NULL REFERENCES customers (karte_no),
  display_name TEXT NOT NULL,
  valid_from   TEXT NOT NULL,
  valid_to     TEXT
);
CREATE UNIQUE INDEX display_name_history_current ON display_name_history (karte_no) WHERE valid_to IS NULL;
CREATE INDEX display_name_history_karte_no ON display_name_history (karte_no);

-- 判定の実行記録
CREATE TABLE judgment_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_date TEXT NOT NULL CHECK (target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  trigger     TEXT NOT NULL CHECK (trigger IN ('cron', 'cron_retry', 'manual')),
  status      TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_code  TEXT,
  started_at  TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX judgment_runs_target_date ON judgment_runs (target_date);

-- 18:00 判定時点のスナップショット（予定ごと1行）
CREATE TABLE judgment_items (
  target_date TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  cancelled   INTEGER NOT NULL CHECK (cancelled IN (0, 1)),
  all_day     INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  title_raw   TEXT NOT NULL,
  start_at    TEXT NOT NULL,
  end_at      TEXT NOT NULL,
  karte_no    TEXT,
  result      TEXT NOT NULL CHECK (result IN ('notify', 'review', 'excluded')),
  reason      TEXT NOT NULL,
  warning     TEXT CHECK (warning IS NULL OR warning IN ('title_outdated')),
  menu        TEXT,
  run_id      INTEGER NOT NULL REFERENCES judgment_runs (id),
  PRIMARY KEY (target_date, event_id)
);

-- 送信ログ。初期段階はシミュレーションのみ（DB 制約でも simulation 以外を拒否）
CREATE TABLE send_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_date TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  start_at    TEXT NOT NULL,
  karte_no    TEXT NOT NULL,
  body        TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode = 'simulation'),
  status      TEXT NOT NULL CHECK (status IN ('simulated', 'failed')),
  retry_key   TEXT NOT NULL UNIQUE,
  run_id      INTEGER REFERENCES judgment_runs (id),
  created_at  TEXT NOT NULL,
  UNIQUE (target_date, event_id, start_at)
);
CREATE INDEX send_logs_created_at ON send_logs (created_at);

-- 判定後の変更に対する「確認済み」。fingerprint が変われば再表示される
CREATE TABLE change_acks (
  target_date TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('added', 'changed', 'removed')),
  fingerprint TEXT NOT NULL,
  acked_at    TEXT NOT NULL,
  PRIMARY KEY (target_date, fingerprint)
);
