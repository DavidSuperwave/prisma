export type WorkspaceDashboardPreset = "operations" | "sales" | "crm" | "custom";

export type WorkspaceStructuredAction =
  | { action: "bootstrap-crm" }
  | { action: "create-dashboard"; preset: WorkspaceDashboardPreset };

export type WorkspaceActionPlan = {
  actions: WorkspaceStructuredAction[];
  sourceMessage: string;
};

function normalize(message: string) {
  return message.toLowerCase().trim();
}

function containsAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function parseWorkspaceActionPlan(message: string): WorkspaceActionPlan | null {
  const normalized = normalize(message);
  if (!normalized) {
    return null;
  }

  const actions: WorkspaceStructuredAction[] = [];
  const asksForCrm = containsAny(normalized, [
    "crear crm",
    "create crm",
    "bootstrap crm",
    "pipeline crm",
    "configura crm",
  ]);
  if (asksForCrm) {
    actions.push({ action: "bootstrap-crm" });
  }

  const asksForDashboard = containsAny(normalized, [
    "crear dashboard",
    "create dashboard",
    "dashboard preset",
    "configura dashboard",
  ]);
  if (asksForDashboard) {
    const preset: WorkspaceDashboardPreset =
      containsAny(normalized, ["ventas", "sales"])
        ? "sales"
        : normalized.includes("crm")
          ? "crm"
          : containsAny(normalized, ["custom", "personalizado"])
            ? "custom"
            : "operations";
    actions.push({ action: "create-dashboard", preset });
  }

  if (actions.length === 0) {
    return null;
  }

  return {
    actions,
    sourceMessage: message,
  };
}

export function buildCopilotActionPlan(message: string) {
  return parseWorkspaceActionPlan(message);
}

export function isWorkspaceActionConfirmation(message: string) {
  const normalized = normalize(message);
  return (
    normalized === "si" ||
    normalized === "sí" ||
    normalized === "confirmar" ||
    normalized === "confirm" ||
    containsAny(normalized, ["confirma", "ejecuta", "procede", "dale"])
  );
}

export function isWorkspaceActionCancellation(message: string) {
  const normalized = normalize(message);
  return (
    normalized === "no" ||
    normalized === "cancelar" ||
    normalized === "cancel" ||
    containsAny(normalized, ["cancela", "deten el plan", "stop plan"])
  );
}

export function describeWorkspaceActionPlan(actions: WorkspaceStructuredAction[]) {
  const labels = actions.map((entry) => {
    if (entry.action === "bootstrap-crm") {
      return "crear CRM base";
    }
    if (entry.preset === "sales") return "crear dashboard de ventas";
    if (entry.preset === "crm") return "crear dashboard CRM";
    if (entry.preset === "custom") return "crear dashboard custom";
    return "crear dashboard de operaciones";
  });
  return labels.join(" + ");
}

export type PlannedWorkspaceActionResult = {
  action: WorkspaceStructuredAction["action"];
  preset?: WorkspaceDashboardPreset;
  status: "executed" | "queued";
  error?: string;
};

export function summarizeWorkspaceActionResults(results: PlannedWorkspaceActionResult[]) {
  if (results.length === 0) {
    return "No se ejecutaron acciones.";
  }

  const segments = results.map((entry) => {
    if (entry.action === "bootstrap-crm") {
      return entry.status === "executed"
        ? "CRM base ejecutado"
        : `CRM en cola (${entry.error ?? "se intentará de nuevo"})`;
    }

    const presetLabel =
      entry.preset === "sales"
        ? "ventas"
        : entry.preset === "crm"
          ? "crm"
          : entry.preset === "custom"
            ? "custom"
            : "operaciones";

    return entry.status === "executed"
      ? `dashboard ${presetLabel} ejecutado`
      : `dashboard ${presetLabel} en cola (${entry.error ?? "se intentará de nuevo"})`;
  });

  return `Listo: ${segments.join(" · ")}.`;
}

