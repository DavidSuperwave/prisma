/**
 * Short-lived cache for generated image candidates so the agent can refer to
 * them by id (`cand_xxx`) instead of shuttling base64 through every tool
 * call. Entries auto-expire after 30 min.
 */

type CandidateEntry = {
  workspaceId: string;
  base64: string;
  mimeType: string;
  sourceUrl: string | null;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 200;

const store = new Map<string, CandidateEntry>();

function sweep() {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(id);
  }
  if (store.size > MAX_ENTRIES) {
    const overflow = store.size - MAX_ENTRIES;
    const iterator = store.keys();
    for (let i = 0; i < overflow; i += 1) {
      const next = iterator.next();
      if (next.done) break;
      store.delete(next.value);
    }
  }
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function putGeneratedCandidate(params: {
  workspaceId: string;
  base64: string;
  mimeType: string;
}): string {
  sweep();
  const id = randomId("gen");
  store.set(id, {
    workspaceId: params.workspaceId,
    base64: params.base64,
    mimeType: params.mimeType,
    sourceUrl: null,
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

export function putSearchCandidate(params: {
  workspaceId: string;
  sourceUrl: string;
}): string {
  sweep();
  const id = randomId("src");
  store.set(id, {
    workspaceId: params.workspaceId,
    base64: "",
    mimeType: "",
    sourceUrl: params.sourceUrl,
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

export function getCandidate(id: string, workspaceId: string): CandidateEntry | null {
  sweep();
  const entry = store.get(id);
  if (!entry) return null;
  if (entry.workspaceId !== workspaceId) return null;
  return entry;
}

export function dropCandidate(id: string) {
  store.delete(id);
}
