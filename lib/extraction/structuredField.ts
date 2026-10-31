type StructuredRole = "system" | "user" | "assistant";

type StructuredMessage = {
  role: StructuredRole;
  content: string;
};

type StructuredProvider = "hermes" | "openrouter";

type StructuredEndpoint = {
  provider: StructuredProvider;
  endpoint: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
};

export type StructuredFieldCallInput = {
  schemaName: string;
  schema: Record<string, unknown>;
  messages: StructuredMessage[];
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string | null;
};

export type StructuredFieldCallResult<T> = {
  data: T;
  provider: StructuredProvider;
  model: string;
  raw: string;
};

function resolveStructuredEndpoints(preferredModel?: string | null): StructuredEndpoint[] {
  const endpoints: StructuredEndpoint[] = [];

  const hermesBase = process.env.HERMES_API_BASE_URL?.trim();
  const hermesKey = process.env.HERMES_API_KEY?.trim();
  const hermesModel = preferredModel?.trim() || process.env.HERMES_MODEL?.trim() || "";
  if (hermesBase && hermesKey && hermesModel) {
    endpoints.push({
      provider: "hermes",
      endpoint: `${hermesBase.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: hermesKey,
      model: hermesModel,
    });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const openRouterModel = preferredModel?.trim() || process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  if (openRouterKey) {
    endpoints.push({
      provider: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterKey,
      model: openRouterModel,
      headers: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "Prisma Structured Extraction",
      },
    });
  }

  return endpoints;
}

function normalizeStructuredContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "text" in (entry as Record<string, unknown>) &&
      typeof (entry as Record<string, unknown>).text === "string"
        ? String((entry as Record<string, unknown>).text)
        : "",
    )
    .join("\n")
    .trim();
}

export async function hermesStructured<T>(input: StructuredFieldCallInput): Promise<StructuredFieldCallResult<T>> {
  const endpoints = resolveStructuredEndpoints(input.preferredModel);
  if (endpoints.length === 0) {
    throw new Error("Structured extraction requires Hermes or OpenRouter API credentials.");
  }

  let lastError = "Structured extraction failed.";
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${endpoint.apiKey}`,
          "Content-Type": "application/json",
          ...(endpoint.headers ?? {}),
        },
        body: JSON.stringify({
          model: endpoint.model,
          temperature: input.temperature ?? 0,
          max_tokens: input.maxTokens ?? 4000,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.schema,
            },
          },
          messages: input.messages,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        lastError = `${endpoint.provider} structured call failed (${response.status}): ${body.slice(0, 240)}`;
        continue;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const raw = normalizeStructuredContent(payload.choices?.[0]?.message?.content ?? "");
      if (!raw) {
        lastError = `${endpoint.provider} structured call returned no content.`;
        continue;
      }

      const parsed = JSON.parse(raw) as T;
      return {
        data: parsed,
        provider: endpoint.provider,
        model: endpoint.model,
        raw,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Structured extraction failed.";
    }
  }

  throw new Error(lastError);
}
