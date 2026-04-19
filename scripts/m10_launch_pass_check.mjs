import { chromium } from "playwright";
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.M10_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PRISMA_DEMO_PASSWORD ?? "PrismaDemo!2026";

const users = {
  george: "george@bbc.local",
  maria: "maria@bbc.local",
};

const artifactsDir = "/opt/cursor/artifacts";
const screenshotPath = `${artifactsDir}/m10_launch_pass_result.png`;
const traceLogPath = `${artifactsDir}/m10_launch_pass_report.json`;
const walkthroughVideoPath = `${artifactsDir}/m10_launch_pass_walkthrough.webm`;

async function login(page, email, next = "/workspaces/bbc-demo?tab=home") {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(next)}`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(/\/workspaces\/bbc-demo/, { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function getObjectIdForLabel(page, objectLabel) {
  const url = new URL(page.url());
  url.searchParams.set("tab", "data");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  const select = page.locator('label:has-text("Objeto") select');
  await select.waitFor({ state: "visible", timeout: 15000 });
  const options = await select.locator("option").all();
  for (const option of options) {
    const label = (await option.textContent())?.trim().toLowerCase();
    if (label === objectLabel.toLowerCase()) {
      const value = await option.getAttribute("value");
      if (value) {
        return value;
      }
    }
  }
  return null;
}

async function ensureComposerSendReady(page, promptText) {
  const chatComposer = page.locator('textarea[placeholder*="Escribe una pregunta"]');
  await chatComposer.waitFor({ state: "visible", timeout: 15000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await chatComposer.fill("");
    await chatComposer.type(promptText, { delay: 12 });
    await page.waitForTimeout(180);
    const sendButton = page.getByRole("button", { name: "Enviar" }).first();
    if (await sendButton.isEnabled().catch(() => false)) {
      return { ready: true, sendButton };
    }
  }
  return { ready: false, sendButton: page.getByRole("button", { name: "Enviar" }).first() };
}

async function setStatusToApprovedInDataTable(page) {
  const objectId = await getObjectIdForLabel(page, "Rate Offers");
  if (!objectId) {
    return { ok: false, reason: "missing_rate_offers_object" };
  }

  const targetUrl = new URL(page.url());
  targetUrl.searchParams.set("tab", "data");
  targetUrl.searchParams.set("object", objectId);
  await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });

  const objectSelect = page.locator('label:has-text("Objeto") select');
  await objectSelect.selectOption(objectId);

  const boardToggle = page.getByRole("button", { name: "Tablero" });
  if (await boardToggle.isVisible().catch(() => false)) {
    await boardToggle.click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Tabla" }).click();
    await page.waitForTimeout(500);
  }

  const rows = page.locator("table tbody tr");
  const rowCount = await rows.count();
  if (rowCount === 0) {
    return { ok: false, reason: "missing_rate_offer_rows" };
  }

  const headerCells = page.locator("table thead th");
  const headerCount = await headerCells.count();
  let statusIndex = -1;
  for (let index = 0; index < headerCount; index += 1) {
    const headerText = ((await headerCells.nth(index).textContent()) ?? "").trim().toLowerCase();
    if (headerText.includes("status")) {
      statusIndex = index;
      break;
    }
  }
  if (statusIndex === -1) {
    return { ok: false, reason: "missing_status_column" };
  }

  let targetRow = rows.first();
  for (let index = 0; index < rowCount; index += 1) {
    const candidate = rows.nth(index);
    const candidateStatus = ((await candidate.locator("td").nth(statusIndex).textContent()) ?? "")
      .trim()
      .toLowerCase();
    if (!candidateStatus.includes("aprob")) {
      targetRow = candidate;
      break;
    }
  }

  async function updateStatusInRow(
    row,
    desiredValues,
    desiredLabelMarkers,
    missingReason,
    failedReason,
  ) {
    const statusCell = row.locator("td").nth(statusIndex);
    await statusCell.click();
    let statusSelect = row.locator("select");
    if ((await statusSelect.count()) === 0) {
      await statusCell.click();
      statusSelect = row.locator("select");
    }
    await statusSelect.waitFor({ state: "visible", timeout: 10000 });
    const options = await statusSelect.locator("option").evaluateAll((entries) =>
      entries.map((entry) => ({
        value: entry.getAttribute("value") ?? "",
        label: entry.textContent?.trim() ?? "",
      })),
    );
    const chosen =
      options.find((entry) =>
        desiredValues.includes(entry.value.trim().toLowerCase()),
      ) ??
      options.find((entry) =>
        desiredLabelMarkers.some((marker) =>
          entry.label.toLowerCase().includes(marker),
        ),
      );
    if (!chosen) {
      return {
        ok: false,
        reason: missingReason,
        options: options.map((entry) => `${entry.value}|${entry.label}`),
      };
    }

    await statusSelect.selectOption({ value: chosen.value });
    await page.waitForTimeout(400);
    await statusSelect.blur();
    await page.waitForTimeout(900);

    const updatedStatusText = ((await statusCell.textContent()) ?? "")
      .toLowerCase()
      .trim();
    const changed = desiredLabelMarkers.some((marker) =>
      updatedStatusText.includes(marker),
    );
    return changed
      ? { ok: true, resolved: updatedStatusText }
      : {
          ok: false,
          reason: failedReason,
          resolved: updatedStatusText,
          options: options.map((entry) => `${entry.value}|${entry.label}`),
        };
  }

  const currentStatusText = ((await targetRow.locator("td").nth(statusIndex).textContent()) ?? "")
    .trim()
    .toLowerCase();
  if (currentStatusText.includes("aprob")) {
    const resetResult = await updateStatusInRow(
      targetRow,
      ["awaiting_approval"],
      ["esperando", "awaiting"],
      "awaiting_option_missing",
      "status_not_awaiting_after_reset",
    );
    if (!resetResult.ok) {
      return resetResult;
    }
  }

  return updateStatusInRow(
    targetRow,
    ["approved"],
    ["aprob", "approved"],
    "approved_option_missing",
    "status_not_approved_after_update",
  );
}

async function verifyApprovalInActivity(page) {
  await page.goto(`${baseUrl}/workspaces/bbc-demo?tab=agents`, { waitUntil: "domcontentloaded" });
  const actionSelect = page.locator('label:has-text("Acción") select');
  if (await actionSelect.isVisible().catch(() => false)) {
    await actionSelect.selectOption("all");
  }
  const daysSelect = page.locator('label:has-text("Ventana") select');
  if (await daysSelect.isVisible().catch(() => false)) {
    await daysSelect.selectOption("30");
  }

  let uiVisible = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await page.getByText("Oferta aprobada", { exact: false }).isVisible().catch(() => false)) {
      uiVisible = true;
      break;
    }
    await page.waitForTimeout(1500);
  }

  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ from, limit: "80", actions: "rate_offer.approved" });
  const apiResponse = await page.request.get(`${baseUrl}/api/workspaces/bbc-demo/activity?${params.toString()}`);
  let apiVisible = false;
  if (apiResponse.ok()) {
    const payload = await apiResponse.json().catch(() => ({}));
    apiVisible = Array.isArray(payload?.activity) && payload.activity.length > 0;
  }

  return {
    ok: uiVisible || apiVisible,
    uiVisible,
    apiVisible,
  };
}

async function run() {
  await mkdir(artifactsDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    slowMo: process.env.M10_RECORD_VIDEO === "1" ? 120 : 0,
  });
  const shouldRecordVideo = process.env.M10_RECORD_VIDEO === "1";
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    ...(shouldRecordVideo
      ? {
          recordVideo: {
            dir: artifactsDir,
            size: { width: 1600, height: 1000 },
          },
        }
      : {}),
  });
  const page = await context.newPage();
  const videoHandle = shouldRecordVideo ? page.video() : null;

  const result = {
    baseUrl,
    checks: {
      georgeBranding: false,
      georgeChatReady: false,
      georgeRateOfferApprove: false,
      georgeActivityShowsApproval: false,
      mariaCanAccessWorkspace: false,
      mariaHasIsolatedChatSession: false,
      mariaCanViewLeads: false,
    },
    notes: [],
  };

  try {
    await login(page, users.george, "/workspaces/bbc-demo?tab=home");
    result.checks.georgeBranding = (await page.getByText("BBC Factoring Demo").count()) > 0;

    await page.goto(`${baseUrl}/workspaces/bbc-demo?tab=chat`, { waitUntil: "domcontentloaded" });
    const georgeComposer = await ensureComposerSendReady(page, "¿Qué nuevos leads entraron hoy?");
    result.checks.georgeChatReady = georgeComposer.ready;
    if (!result.checks.georgeChatReady) {
      result.notes.push("chat_send_disabled_for_george");
    } else {
      await georgeComposer.sendButton.click();
      await page.waitForTimeout(2200);
    }

    const approveResult = await setStatusToApprovedInDataTable(page);
    result.checks.georgeRateOfferApprove = approveResult.ok;
    if (!approveResult.ok) {
      result.notes.push(approveResult.reason);
    }

    const approvalCheck = await verifyApprovalInActivity(page);
    result.checks.georgeActivityShowsApproval = approvalCheck.ok;
    if (!result.checks.georgeActivityShowsApproval) {
      result.notes.push("missing_rate_offer_approval_activity");
    } else if (!approvalCheck.uiVisible && approvalCheck.apiVisible) {
      result.notes.push("approval_activity_verified_via_api");
    }

    await page.goto(`${baseUrl}/logout`, { waitUntil: "domcontentloaded" });
    await login(page, users.maria, "/workspaces/bbc-demo?tab=chat");
    result.checks.mariaCanAccessWorkspace = page.url().includes("/workspaces/bbc-demo");

    const mariaComposer = await ensureComposerSendReady(page, "¿Qué nuevos leads entraron hoy?");
    const mariaChatReady = mariaComposer.ready;
    result.checks.mariaHasIsolatedChatSession = mariaChatReady;
    if (mariaChatReady) {
      await mariaComposer.sendButton.click();
      await page.waitForTimeout(1800);
    } else {
      result.notes.push("chat_send_disabled_for_maria");
    }

    const sessionList = page.locator("button").filter({ hasText: "Nuevo chat" });
    result.checks.mariaHasIsolatedChatSession = result.checks.mariaHasIsolatedChatSession && (await sessionList.count()) > 0;

    const leadsObjectId = await getObjectIdForLabel(page, "Leads");
    if (leadsObjectId) {
      await page.goto(`${baseUrl}/workspaces/bbc-demo?tab=data&object=${encodeURIComponent(leadsObjectId)}`, {
        waitUntil: "domcontentloaded",
      });
      const rows = page.locator("table tbody tr");
      result.checks.mariaCanViewLeads = (await rows.count()) > 0;
    } else {
      result.notes.push("missing_leads_object");
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await context.close();
    await browser.close();
    if (videoHandle) {
      const rawVideoPath = await videoHandle.path();
      await copyFile(rawVideoPath, walkthroughVideoPath);
    }
  }

  await writeFile(traceLogPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
