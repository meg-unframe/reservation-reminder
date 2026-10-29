import { describe, expect, it } from "vitest";
import { computeDisplayNames, diffDisplayNames } from "../../../src/domain/displayName";
import type { Customer } from "../../../src/domain/types";

// すべて架空の顧客
function customer(karteNo: string, familyName: string, givenName: string, status: Customer["status"] = "active"): Customer {
  return { karteNo, familyName, givenName, familyKana: "", givenKana: "", status };
}

describe("computeDisplayNames", () => {
  it("同姓がいなければ「姓様（番号）」", () => {
    const names = computeDisplayNames([customer("0001", "田中", "花子"), customer("0002", "佐藤", "健")]);
    expect(names.get("0001")).toBe("田中様（0001）");
    expect(names.get("0002")).toBe("佐藤様（0002）");
  });

  it("同姓が追加されると既存顧客も含め全員に頭文字が付く", () => {
    const before = computeDisplayNames([customer("0001", "田中", "花子")]);
    const after = computeDisplayNames([customer("0001", "田中", "花子"), customer("0058", "田中", "友子")]);
    expect(before.get("0001")).toBe("田中様（0001）");
    expect(after.get("0001")).toBe("田中(花)様（0001）");
    expect(after.get("0058")).toBe("田中(友)様（0058）");
  });

  it("頭文字も重複する場合は形式を変えずカルテ番号で区別する", () => {
    const names = computeDisplayNames([customer("0058", "田中", "友子"), customer("0102", "田中", "友美")]);
    expect(names.get("0058")).toBe("田中(友)様（0058）");
    expect(names.get("0102")).toBe("田中(友)様（0102）");
  });

  it("3人以上の同姓でも全員に頭文字が付く", () => {
    const names = computeDisplayNames([
      customer("0001", "田中", "花子"),
      customer("0002", "田中", "友子"),
      customer("0003", "田中", "ゆき"),
    ]);
    expect([...names.values()]).toEqual(["田中(花)様（0001）", "田中(友)様（0002）", "田中(ゆ)様（0003）"]);
  });

  it("同姓の一方が論理削除されると残った顧客は頭文字なしに戻る", () => {
    const names = computeDisplayNames([customer("0001", "田中", "花子"), customer("0058", "田中", "友子", "inactive")]);
    expect(names.get("0001")).toBe("田中様（0001）");
    expect(names.has("0058")).toBe(false);
  });

  it("異体字・別表記の姓は別人として扱う", () => {
    const names = computeDisplayNames([
      customer("0001", "斉藤", "一郎"),
      customer("0002", "斎藤", "二郎"),
      customer("0003", "高橋", "三郎"),
      customer("0004", "髙橋", "四郎"),
    ]);
    expect([...names.values()]).toEqual(["斉藤様（0001）", "斎藤様（0002）", "高橋様（0003）", "髙橋様（0004）"]);
  });

  it("全角/半角・空白の揺れは同じ姓として扱う", () => {
    const names = computeDisplayNames([customer("0001", "ﾀﾅｶ", "ﾊﾅｺ"), customer("0002", " タナカ　", "ユキ")]);
    expect(names.get("0001")).toBe("タナカ(ハ)様（0001）");
    expect(names.get("0002")).toBe("タナカ(ユ)様（0002）");
  });

  it("サロゲートペアの漢字も頭文字1文字として扱う", () => {
    const names = computeDisplayNames([customer("0001", "山田", "𠮷乃"), customer("0002", "山田", "太郎")]);
    expect(names.get("0001")).toBe("山田(𠮷)様（0001）");
  });

  it("敬称は必ず「様」で「さん」は含まない", () => {
    const names = computeDisplayNames([customer("0001", "田中", "花子"), customer("0002", "田中", "友子"), customer("0003", "佐藤", "健")]);
    for (const name of names.values()) {
      expect(name).toMatch(/様（\d{4}）$/);
      expect(name).not.toContain("さん");
    }
  });
});

describe("diffDisplayNames", () => {
  it("同姓追加時に既存顧客の変更と新規顧客を列挙する", () => {
    const before = computeDisplayNames([customer("0001", "田中", "花子"), customer("0002", "佐藤", "健")]);
    const after = computeDisplayNames([
      customer("0001", "田中", "花子"),
      customer("0002", "佐藤", "健"),
      customer("0003", "田中", "友子"),
    ]);
    expect(diffDisplayNames(before, after)).toEqual([
      { karteNo: "0001", before: "田中様（0001）", after: "田中(花)様（0001）" },
      { karteNo: "0003", before: null, after: "田中(友)様（0003）" },
    ]);
  });

  it("論理削除は after が null になる", () => {
    const before = computeDisplayNames([customer("0001", "佐藤", "健")]);
    expect(diffDisplayNames(before, new Map())).toEqual([{ karteNo: "0001", before: "佐藤様（0001）", after: null }]);
  });
});
