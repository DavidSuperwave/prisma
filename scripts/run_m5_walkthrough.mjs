import fs from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = "http://localhost:3000";
const artifactDir = "/opt/cursor/artifacts";

async function ensureDir(path) {
  await fs.mkdir(path, { recursive: true });
}

function extractWorkspaceSlug(url) {
  const match = url.match(/\/workspaces\/([^/?#]+)/);
  return match?.[1] ?? null;
}

async function resolveWorkspaceWithCopilot(page) {
  await page.goto(`${baseUrl}/workspaces`, { waitUntil: "domcontentloaded" });
  const hrefs = await page
    .locator('a[href*="/workspaces/"]')
    .evaluateAll((anchors) =>
      anchors
        .map((anchor) => anchor.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/workspaces/")),
    );
  const uniqueSlugs = Array.from(
    new Set(
      hrefs
        .map((href) => extractWorkspaceSlug(href))
        .filter((slug) => Boolean(slug)),
    ),
  );

  for (const slug of uniqueSlugs) {
    await page.goto(`${baseUrl}/workspaces/${slug}?tab=chat`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(700);
    const hasComposer = (await page.locator('textarea[placeholder*="workspace"]').count()) > 0;
    if (hasComposer) {
      return slug;
    }
  }

  return null;
}

async function chooseDealsObject(page) {
  const objectSelect = page.locator('label:has-text("Objeto") select').first();
  if ((await objectSelect.count()) === 0) return;
  const options = await objectSelect.locator("option").allTextContents();
  const target = options.find((option) => {
    const normalized = option.toLowerCase();
    return normalized.includes("deal") || normalized.includes("oportun");
  });
  if (!target) return;
  await objectSelect.selectOption({ label: target.trim() });
  await page.waitForTimeout(600);
}

async function clickFirstDeal(page) {
  const boardCard = page
    .locator("a")
    .filter({ has: page.locator('p:has-text("Owner:")') })
    .first();
  if ((await boardCard.count()) > 0) {
    await boardCard.click();
    return true;
  }

  const firstRow = page.locator("tbody tr").first();
  if ((await firstRow.count()) > 0) {
    await firstRow.click();
    return true;
  }

  return false;
}

async function main() {
  await ensureDir(artifactDir);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: artifactDir,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  const video = page.video();

  let workspaceSlug = "bbc-demo";

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo-admin@prisma.local");
  await page.fill('input[name="password"]', "PrismaDemo!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(1200);
  await page.goto(`${baseUrl}/workspaces`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    const loginError = await page.locator("form p").first().textContent().catch(() => null);
    throw new Error(`Login failed for demo-admin user.${loginError ? ` ${loginError}` : ""}`);
  }

  const resolvedSlug = await resolveWorkspaceWithCopilot(page);
  if (!resolvedSlug) {
    throw new Error("No workspace with copilot composer was found.");
  }
  workspaceSlug = resolvedSlug;
  await page.goto(`${baseUrl}/workspaces/${workspaceSlug}?tab=chat`, {
    waitUntil: "domcontentloaded",
  });

  const composer = page.locator('textarea[placeholder*="workspace"]').first();
  await composer.waitFor({ timeout: 30000 });
  await composer.fill("crear crm y crear dashboard de ventas");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.getByText("Plan detectado", { exact: false }).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${artifactDir}/m5_chat_plan_confirmation.png`, fullPage: true });

  await composer.fill("si");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.getByText("Listo:", { exact: false }).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${artifactDir}/m5_chat_execution_result.png`, fullPage: true });

  await page.goto(`${baseUrl}/workspaces/${workspaceSlug}?tab=data`, { waitUntil: "domcontentloaded" });
  await chooseDealsObject(page);
  await page.getByText("Pipeline board", { exact: false }).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${artifactDir}/m5_pipeline_board.png`, fullPage: true });

  const openedFromBoard = await clickFirstDeal(page);
  if (openedFromBoard) {
    await page.waitForURL(/tab=record/, { timeout: 20000 });
  } else {
    const recordLink = page.locator('a[href*="tab=record"]').first();
    const href = await recordLink.getAttribute("href");
    if (!href) {
      throw new Error("No record link found from pipeline board.");
    }
    await page.goto(new URL(href, baseUrl).toString(), { waitUntil: "domcontentloaded" });
  }
  await page.getByText("Resumen CRM", { exact: false }).first().waitFor({ timeout: 20000 });
  await page.getByText("Timeline", { exact: false }).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${artifactDir}/m5_record_detail_three_column.png`, fullPage: true });

  await page.goto(`${baseUrl}/workspaces/${workspaceSlug}?tab=agents`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Deploy/i }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Pause/i }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${artifactDir}/m5_runtime_controls.png`, fullPage: true });

  await page.close();
  await context.close();
  await browser.close();

  if (video) {
    const rawPath = await video.path();
    await fs.copyFile(rawPath, `${artifactDir}/m5_workspace_walkthrough.webm`);
  }

  console.log(`Workspace used: ${workspaceSlug}`);
  console.log("Artifacts generated in /opt/cursor/artifacts");
}

main().catch(async (error) => {
  try {
    const fallbackPath = `${artifactDir}/m5_walkthrough_failure.txt`;
    await fs.writeFile(fallbackPath, String(error?.stack ?? error), "utf8");
  } catch {
    // ignore failure artifact errors
  }
  console.error(error);
  process.exitCode = 1;
});
