import { expect, it } from "vitest";
import { exportSuccessMessage } from "../web/export-message.js";

it("makes the workbench delivery package result immediately understandable", () => {
  expect(
    exportSuccessMessage("capcut-package", "/project/workbench/exports/capcut-delivery-package-v001"),
  ).toBe("已生成工作台交付包 · capcut-delivery-package-v001");
});
