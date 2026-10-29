// リポジトリ内のファイルを文字列として読み込む。テストは Workers ランタイムで動き fs を使えないため、
// Vite の import.meta.glob でテスト実行時に取り込む。キーはリポジトリルートからの相対パスにそろえる。

/** test/safety/ からの相対パス → リポジトリルートからの相対パス */
function toRepoPath(key: string): string {
  const parts = ["test", "safety"];
  for (const segment of key.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

function normalize(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([key, content]) => [toRepoPath(key), content]));
}

/** 本番 Worker に含まれるソース */
export const sourceFiles = normalize(
  import.meta.glob<string>("../../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
);

/** リポジトリで管理するファイル（node_modules・.wrangler・package-lock.json は除く） */
export const repoFiles = {
  ...sourceFiles,
  ...normalize(
    import.meta.glob<string>(
      [
        "../../test/**/*.{ts,tsx}",
        "../../fixtures/*.json",
        "../../migrations/*.sql",
        "../../*.{json,toml,ts}",
        "../../.dev.vars.example",
        "../../.gitignore",
        "!../../package-lock.json",
      ],
      { query: "?raw", import: "default", eager: true },
    ),
  ),
};

export function fileContent(path: string): string {
  const content = repoFiles[path];
  if (content === undefined) throw new Error(`読み込まれていないファイルです: ${path}`);
  return content;
}
