import { closeProvider } from "./providers/close";
import { hubspotProvider } from "./providers/hubspot";
import { genericHttpProvider } from "./providers/genericHttp";
import { gbAutomotrizCmsProvider } from "./providers/gbAutomotrizCms";
import { customApiProvider } from "./providers/customApi";
import { vercelProvider } from "./providers/vercel";
import { browserUseProvider } from "./providers/browserUse";
import type { ProviderAdapter } from "./providers/types";

const PROVIDERS: ProviderAdapter[] = [
  customApiProvider,
  closeProvider,
  hubspotProvider,
  genericHttpProvider,
  gbAutomotrizCmsProvider,
  vercelProvider,
  browserUseProvider,
];

const MAP = new Map(PROVIDERS.map((p) => [p.provider, p]));

export function getProviderAdapter(provider: string): ProviderAdapter | null {
  return MAP.get(provider) ?? null;
}

export function listProviderAdapters(): ProviderAdapter[] {
  return PROVIDERS;
}
