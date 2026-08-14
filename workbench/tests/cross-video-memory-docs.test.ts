import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

const brainRoot = process.env.CHEN_BRAIN_ROOT
  ?? "/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统";

it("defines a compact archive and index for prior video retrospectives", async () => {
  const [archiveGuide, template, index] = await Promise.all([
    readFile(join(brainRoot, "07｜视频复盘归档", "README.md"), "utf8"),
    readFile(join(brainRoot, "07｜视频复盘归档", "视频复盘模板.md"), "utf8"),
    readFile(join(brainRoot, "07｜视频复盘索引.md"), "utf8"),
  ]);

  expect(archiveGuide).toContain("不可覆盖");
  expect(template).toContain("继承给下一条视频的提醒");
  expect(index).toContain("| 复盘 ID | 日期 | 主题标签 |");
});

it("requires new video tasks to retrieve relevant prior retrospectives without loading all history", async () => {
  const [entry, calibration, skill] = await Promise.all([
    readFile(join(brainRoot, "00｜MAX剪辑系统入口与读取顺序.md"), "utf8"),
    readFile(join(brainRoot, "06｜MAX剪辑反馈与校准库.md"), "utf8"),
    readFile(join(process.cwd(), ".codex", "skills", "max-jianji-skill", "SKILL.md"), "utf8"),
  ]);

  expect(entry).toContain("定向检索07｜视频复盘索引");
  expect(entry).toContain("不得全文加载历史复盘");
  expect(calibration).toContain("复盘 ID");
  expect(skill).toContain("读取的复盘 ID");
  expect(skill).toContain("没有复盘包不得称为已完成记忆回流");
});
