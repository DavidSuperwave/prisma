/**
 * Shared keep-alive HTTP dispatcher for outbound calls to the Hermes runtime
 * and WhatsApp sidecar. Reusing TCP/TLS connections avoids re-handshaking on
 * every chat request, which is especially costly under concurrency or when
 * Hermes is on a remote host.
 *
 * Next.js (Node runtime) ships `undici` implicitly via the global `fetch`, so
 * we only attempt to load the shared Agent at runtime and silently skip it in
 * Edge runtimes where it is not available. Callers receive a `RequestInit`
 * overlay via {@link hermesFetchInit} which they can spread into their own
 * fetch options without having to know about undici.
 */

type AnyDispatcher = unknown;

let dispatcherPromise: Promise<AnyDispatcher | null> | null = null;

async function getDispatcher(): Promise<AnyDispatcher | null> {
  if (dispatcherPromise) return dispatcherPromise;
  dispatcherPromise = (async () => {
    try {
      // `undici` is bundled with Node 18+. Use a variable specifier so the
      // edge bundler does not attempt to statically resolve the module, and
      // so we do not need @types/undici in devDependencies.
      const specifier = "undici";
      const mod: unknown = await import(specifier);
      const AgentCtor = (mod as { Agent?: new (options: unknown) => AnyDispatcher }).Agent;
      if (!AgentCtor) return null;
      return new AgentCtor({
        keepAliveTimeout: 30_000,
        keepAliveMaxTimeout: 60_000,
        connections: 64,
        pipelining: 1,
      });
    } catch {
      return null;
    }
  })();
  return dispatcherPromise;
}

/**
 * Returns extra `fetch` init fields to attach a shared keep-alive dispatcher
 * when running on Node. Safe to spread into any `fetch(url, init)` call.
 */
export async function hermesFetchInit(): Promise<Record<string, unknown>> {
  const dispatcher = await getDispatcher();
  return dispatcher ? { dispatcher } : {};
}
