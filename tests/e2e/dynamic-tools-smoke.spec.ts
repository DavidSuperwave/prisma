import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.join(process.cwd(), "tests/fixtures/grupo-automotriz-workflow.md");

test("grupo automotriz fixture is readable and contains expected sections", async () => {
  const text = await readFile(fixture, "utf-8");
  expect(text).toContain("Grupo Automotriz");
  expect(text).toMatch(/Inventory|inventario/i);
  expect(text).toMatch(/[Ll]ead|routing/i);
});
