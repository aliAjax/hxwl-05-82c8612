import { describe, it, expect } from "vitest";
import {
  parseWaterRecordsCsv,
  cleanNumeric,
  parseDateTime,
  validateSingleRow,
} from "./csvParser";
import type { WaterMetrics } from "../db/types";

describe("csvParser - 表头别名识别", () => {
  it("应识别标准中文表头", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度,备注
草缸A,2026-06-15 09:30,6.8,0,0,18,8,26,正常稳定`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(1);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].data.tankName).toBe("草缸A");
    expect(result.validRows[0].data.metrics.ph).toBe("6.8");
    expect(result.validRows[0].data.metrics.ammonia).toBe("0");
    expect(result.validRows[0].data.metrics.nitrate).toBe("18");
    expect(result.validRows[0].data.remark).toBe("正常稳定");
  });

  it("应识别英文表头别名", () => {
    const csv = `tank,time,pH,ammonia,nitrite,nitrate,hardness,temperature,note
海缸B,2026-06-15 10:00,8.1,0.02,0.01,5,12,27,钙硬度偏低`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(1);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].data.tankName).toBe("海缸B");
    expect(result.validRows[0].data.metrics.ph).toBe("8.1");
    expect(result.validRows[0].data.metrics.ammonia).toBe("0.02");
  });

  it("应识别带空格和特殊符号的表头", () => {
    const csv = `"鱼缸 名称","检测 时间","pH 值","氨 氮","亚 硝 酸 盐","硝 酸 盐","硬 度","温 度","备 注"
草缸C,2026-06-15 14:20,7.2,0.1,0.3,25,6,28,亚硝酸盐升高`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(1);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].data.tankName).toBe("草缸C");
    expect(result.validRows[0].data.metrics.ph).toBe("7.2");
  });

  it("应识别大小写不敏感的表头", () => {
    const csv = `TANKNAME,RECORDATEDAT,PH,AMMONIA,NITRITE,NITRATE,HARDNESS,TEMPERATURE,REMARK
繁殖缸D,2026-06-16 08:00,7.0,0,0,10,5,26,测试`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(1);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].data.tankName).toBe("繁殖缸D");
  });

  it("应识别部分别名表头", () => {
    const csv = `缸名,日期,酸碱度,氨,亚硝,硝,gh,水温,说明
三湖缸E,2026-06-16 09:00,8.2,0.05,0.02,20,15,27,正常`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(1);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].data.tankName).toBe("三湖缸E");
    expect(result.validRows[0].data.metrics.ph).toBe("8.2");
    expect(result.validRows[0].data.metrics.hardness).toBe("15");
  });
});

describe("csvParser - 无表头导入", () => {
  it("无表头时应使用默认列顺序解析", () => {
    const csv = `草缸A,2026-06-15 09:30,6.8,0,0,18,8,26,正常稳定
海缸B,2026-06-15 10:00,8.1,0.02,0.01,5,12,27,钙硬度偏低`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validRows.length).toBe(2);
    expect(result.validRows[0].data.tankName).toBe("草缸A");
    expect(result.validRows[0].data.metrics.ph).toBe("6.8");
    expect(result.validRows[1].data.tankName).toBe("海缸B");
    expect(result.validRows[1].data.metrics.ph).toBe("8.1");
  });

  it("纯数值首行应判定为无表头", () => {
    const csv = `草缸01,2026-01-01,7.0,0.1,0.2,30,10,25,备注1
草缸02,2026-01-02,7.1,0.2,0.3,35,11,26,备注2`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validRows.length).toBe(2);
  });
});

describe("csvParser - 日期格式转换", () => {
  it("应解析 YYYY-MM-DD HH:mm 格式", () => {
    const result = parseDateTime("2026-06-15 09:30");
    expect(result).toBe("2026-06-15 09:30");
  });

  it("应解析 YYYY/MM/DD HH:mm 格式", () => {
    const result = parseDateTime("2026/06/15 09:30");
    expect(result).toBe("2026-06-15 09:30");
  });

  it("应解析 DD/MM/YYYY 格式", () => {
    const result = parseDateTime("15/06/2026");
    expect(result).toBe("2026-06-15 00:00");
  });

  it("应解析 YYYY-MM-DD 格式并补零时间", () => {
    const result = parseDateTime("2026-06-15");
    expect(result).toBe("2026-06-15 00:00");
  });

  it("应解析 ISO 8601 格式", () => {
    const result = parseDateTime("2026-06-15T09:30:00");
    expect(result).toBe("2026-06-15 09:30");
  });

  it("应解析带秒的时间格式", () => {
    const result = parseDateTime("2026-06-15 09:30:45");
    expect(result).toBe("2026-06-15 09:30");
  });

  it("无效日期应返回 null", () => {
    expect(parseDateTime("")).toBeNull();
    expect(parseDateTime("invalid")).toBeNull();
    expect(parseDateTime("不是日期")).toBeNull();
  });

  it("CSV 解析中日期列应自动转换格式", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
草缸A,2026/06/15 14:30,6.8,0,0,18,8,26`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.validRows[0].data.recordedAt).toBe("2026-06-15 14:30");
  });
});

describe("csvParser - 数值清洗", () => {
  it("应去除单位后缀", () => {
    expect(cleanNumeric("6.8pH")).toBe("6.8");
    expect(cleanNumeric("18ppm")).toBe("18");
    expect(cleanNumeric("25°C")).toBe("25");
    expect(cleanNumeric("8dGH")).toBe("8");
  });

  it("应去除空格和特殊符号", () => {
    expect(cleanNumeric(" 6.8 ")).toBe("6.8");
    expect(cleanNumeric("  18.5  ")).toBe("18.5");
  });

  it("应处理负数值", () => {
    expect(cleanNumeric("-1.5")).toBe("-1.5");
    expect(cleanNumeric("-0.01")).toBe("-0.01");
  });

  it("空值或非数值应返回空字符串", () => {
    expect(cleanNumeric("")).toBe("");
    expect(cleanNumeric("abc")).toBe("");
    expect(cleanNumeric("-")).toBe("");
    expect(cleanNumeric(".")).toBe("");
  });

  it("CSV 解析中数值列应自动清洗", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
草缸A,2026-06-15 09:30,6.8pH,0ppm,0.01ppm,18ppm,8dGH,26°C`;
    const result = parseWaterRecordsCsv(csv);
    const metrics = result.validRows[0].data.metrics;
    expect(metrics.ph).toBe("6.8");
    expect(metrics.ammonia).toBe("0");
    expect(metrics.nitrite).toBe("0.01");
    expect(metrics.nitrate).toBe("18");
    expect(metrics.hardness).toBe("8");
    expect(metrics.temperature).toBe("26");
  });
});

describe("csvParser - 必填鱼缸名称缺失", () => {
  it("鱼缸名称为空时应判定为错误行", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
,2026-06-15 09:30,6.8,0,0,18,8,26`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(1);
    expect(result.errorRows.length).toBe(1);
    expect(result.errorRows[0].missingFields).toContain("tankName");
  });

  it("鱼缸名称只有空格时应判定为错误行", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
   ,2026-06-15 09:30,6.8,0,0,18,8,26`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.errorRows.length).toBe(1);
    expect(result.errorRows[0].missingFields).toContain("tankName");
  });

  it("缺少鱼缸名称列时应判定为错误行", () => {
    const csv = `检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
2026-06-15 09:30,6.8,0,0,18,8,26`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.errorRows.length).toBe(1);
    expect(result.errorRows[0].missingFields).toContain("tankName");
  });

  it("validateSingleRow 应正确验证鱼缸名称必填", () => {
    const emptyMetrics: WaterMetrics = {
      ph: "6.8",
      ammonia: "0",
      nitrite: "0",
      nitrate: "18",
      hardness: "8",
      temperature: "26",
      waterChange: "",
    };
    const result1 = validateSingleRow("", "2026-06-15 09:30", emptyMetrics);
    expect(result1.isValid).toBe(false);
    expect(result1.missingFields).toContain("tankName");

    const result2 = validateSingleRow("草缸A", "2026-06-15 09:30", emptyMetrics);
    expect(result2.isValid).toBe(true);
  });
});

describe("csvParser - 边界与综合场景", () => {
  it("空 CSV 应返回空结果", () => {
    const result = parseWaterRecordsCsv("");
    expect(result.totalRows).toBe(0);
    expect(result.validRows.length).toBe(0);
    expect(result.errorRows.length).toBe(0);
  });

  it("只有表头应返回零行数据", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度,备注`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(0);
  });

  it("应正确处理带引号的字段", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度,备注
"草缸,测试",2026-06-15 09:30,6.8,0,0,18,8,26,"带,逗号,的备注"`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].data.tankName).toBe("草缸,测试");
    expect(result.validRows[0].data.remark).toBe("带,逗号,的备注");
  });

  it("数值越界应产生错误", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
草缸A,2026-06-15 09:30,15,0,0,18,8,26`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.errorRows.length).toBe(1);
    expect(result.errorRows[0].errors.some((e) => e.includes("pH"))).toBe(true);
  });

  it("至少需要一项水质指标", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
草缸A,2026-06-15 09:30,,,,,,`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.errorRows.length).toBe(1);
    expect(
      result.errorRows[0].errors.some((e) => e.includes("至少需要一项水质指标"))
    ).toBe(true);
  });

  it("日期缺失应自动填充当前时间但不计为错误", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
草缸A,,6.8,0,0,18,8,26`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].data.recordedAt).not.toBe("");
    expect(result.validRows[0].missingFields).toContain("recordedAt");
  });

  it("多行混合有效和无效数据", () => {
    const csv = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度
草缸A,2026-06-15 09:30,6.8,0,0,18,8,26
,2026-06-15 10:00,7.0,0,0,20,9,27
海缸B,2026-06-15 11:00,8.1,0.02,0.01,5,12,28`;
    const result = parseWaterRecordsCsv(csv);
    expect(result.totalRows).toBe(3);
    expect(result.validRows.length).toBe(2);
    expect(result.errorRows.length).toBe(1);
  });
});
