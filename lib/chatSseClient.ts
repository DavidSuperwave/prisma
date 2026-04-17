/**
 * Incremental SSE parser for /api/chat (text/event-stream).
 * Buffers until a blank line (\n\n) separates complete events — do not slice the
 * buffer when no delimiter exists (avoids corrupting partial `data:` lines).
 */
export function consumeCompleteSseDataLines(buffer: string): { remainder: string; dataLines: string[] } {
  const segments = buffer.split("\n\n");
  const remainder = segments.pop() ?? "";
  const dataLines: string[] = [];

  for (const segment of segments) {
    for (const line of segment.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (payload) {
        dataLines.push(payload);
      }
    }
  }

  return { remainder, dataLines };
}
