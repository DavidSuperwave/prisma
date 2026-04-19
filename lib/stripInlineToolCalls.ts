/**
 * Utility for scrubbing inline tool_call JSON envelopes out of arbitrary
 * assistant text. The streaming chat pipeline strips these at emit time, but
 * historical messages persisted before that pipeline existed still contain
 * the raw JSON — this helper makes the thread-read path resilient.
 *
 * Accepts all three envelope-type spellings that the LLM produces:
 *   {"type":"tool_call", ...}
 *   {"type":"tool-call", ...}
 *   {"type":"toolcall",  ...}
 *
 * Walks the text byte-by-byte (respecting JSON string escaping and nesting)
 * so it correctly removes envelopes whose `args` contain nested objects.
 */

const TYPE_MARKER = /"type"\s*:\s*"tool[_-]?call"/i;

function findBalancedObjectEnd(text: string, start: number): number {
  if (text[start] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function stripInlineToolCallsFromText(input: string): string {
  if (!input || typeof input !== "string") return input ?? "";
  if (!TYPE_MARKER.test(input)) return input;

  const parts: string[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const brace = input.indexOf("{", cursor);
    if (brace === -1) {
      parts.push(input.slice(cursor));
      break;
    }
    const end = findBalancedObjectEnd(input, brace);
    if (end === -1) {
      // Unbalanced — keep the rest verbatim so we don't eat partial prose.
      parts.push(input.slice(cursor));
      break;
    }
    const candidate = input.slice(brace, end);
    if (TYPE_MARKER.test(candidate)) {
      try {
        const parsed = JSON.parse(candidate) as { type?: unknown; name?: unknown };
        const typeField = typeof parsed.type === "string"
          ? parsed.type.toLowerCase().replace(/[-_]/g, "")
          : "";
        if (typeField === "toolcall" && typeof parsed.name === "string") {
          parts.push(input.slice(cursor, brace));
          cursor = end;
          continue;
        }
      } catch {
        // Not valid JSON — fall through and keep it verbatim.
      }
    }
    parts.push(input.slice(cursor, end));
    cursor = end;
  }

  // Collapse any double spaces or dangling whitespace the removal left behind.
  return parts.join("").replace(/[\t ]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
