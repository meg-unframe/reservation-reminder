/** NFKC 正規化し、空白（全角含む）をすべて除去する。全角/半角・空白の揺れを吸収する比較用。 */
export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "");
}
