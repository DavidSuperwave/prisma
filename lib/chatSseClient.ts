/**
 * Incremental SSE parser for /api/chat (text/event-stream).
 * Supports LF and CRLF event delimiters so partial buffers are emitted as soon as
 * a complete SSE event arrives.
 */
export function consumeCompleteSseDataLines(buffer: string): { remainder: string; dataLines: string[] } {
  const delimiterPattern = /\r?\n\r?\n/g;
  const segments: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = delimiterPattern.exec(buffer)) !== null) {
    segments.push(buffer.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
  }

  const remainder = buffer.slice(lastIndex);
  const dataLines: string[] = [];

  for (const segment of segments) {
    for (const line of segment.split(/\r?\n/)) {
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
