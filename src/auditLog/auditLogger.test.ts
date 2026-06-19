import { describe, it, expect } from "vitest";
import { computeChangedFields } from "./auditLogger";
import type { FieldChange } from "./types";

describe("auditLogger - computeChangedFields 字段变更计算", () => {
  it("两个 undefined 应返回空数组", () => {
    const result = computeChangedFields(undefined, undefined);
    expect(result).toEqual([]);
  });

  it("只有 before 应标记全部为删除（oldValue有值，newValue为undefined）", () => {
    const before = { name: "草缸A", ph: "6.5" };
    const result = computeChangedFields(before, undefined);
    expect(result).toHaveLength(2);
    expect(result[0].field).toBe("name");
    expect(result[0].oldValue).toBe("草缸A");
    expect(result[0].newValue).toBeUndefined();
  });

  it("只有 after 应标记全部为新增", () => {
    const after = { name: "草缸A", ph: "6.5" };
    const result = computeChangedFields(undefined, after);
    expect(result).toHaveLength(2);
    expect(result[0].field).toBe("name");
    expect(result[0].oldValue).toBeUndefined();
    expect(result[0].newValue).toBe("草缸A");
  });

  it("相同对象应返回空变更", () => {
    const data = { name: "草缸A", ph: "6.5" };
    const result = computeChangedFields(data, data);
    expect(result).toEqual([]);
  });

  it("部分字段变更应只返回变更字段", () => {
    const before = { name: "草缸A", ph: "6.5", nitrate: "10" };
    const after = { name: "草缸A", ph: "6.8", nitrate: "10" };
    const result = computeChangedFields(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("ph");
    expect(result[0].oldValue).toBe("6.5");
    expect(result[0].newValue).toBe("6.8");
  });

  it("字段标签应从 FIELD_LABELS 映射", () => {
    const before = { ph: "6.5" };
    const after = { ph: "6.8" };
    const result = computeChangedFields(before, after);
    expect(result[0].fieldLabel).toBe("pH");
  });

  it("未知字段标签应回退为字段名", () => {
    const before = { unknownField: "value1" };
    const after = { unknownField: "value2" };
    const result = computeChangedFields(before, after);
    expect(result[0].fieldLabel).toBe("unknownField");
  });

  it("嵌套对象应通过 JSON.stringify 深度比较", () => {
    const before = { config: { a: 1, b: 2 } };
    const after = { config: { a: 1, b: 3 } };
    const result = computeChangedFields(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("config");
  });

  it("嵌套对象相同内容不应产生变更", () => {
    const before = { config: { a: 1, b: 2 } };
    const after = { config: { a: 1, b: 2 } };
    const result = computeChangedFields(before, after);
    expect(result).toEqual([]);
  });

  it("新增字段应标记为变更", () => {
    const before = { name: "草缸A" };
    const after = { name: "草缸A", note: "新增备注" };
    const result = computeChangedFields(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("note");
    expect(result[0].oldValue).toBeUndefined();
    expect(result[0].newValue).toBe("新增备注");
  });

  it("删除字段应标记为变更", () => {
    const before = { name: "草缸A", note: "旧备注" };
    const after = { name: "草缸A" };
    const result = computeChangedFields(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("note");
    expect(result[0].oldValue).toBe("旧备注");
    expect(result[0].newValue).toBeUndefined();
  });

  it("数值类型变更应正确识别", () => {
    const before = { count: 10 };
    const after = { count: 20 };
    const result = computeChangedFields(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>
    );
    expect(result).toHaveLength(1);
    expect(result[0].oldValue).toBe(10);
    expect(result[0].newValue).toBe(20);
  });

  it("空字符串与 null 应视为不同", () => {
    const before = { note: "" };
    const after = { note: null };
    const result = computeChangedFields(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>
    );
    expect(result).toHaveLength(1);
  });
});
