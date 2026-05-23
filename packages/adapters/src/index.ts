import type { Adapter } from '@search-gateway/shared';
import { arxivAdapter } from './arxiv.js';
import { exaAdapter } from './exa.js';
import { perplexityAdapter } from './perplexity.js';

const registry = new Map<string, Adapter>();

export function registerAdapter(adapter: Adapter): void {
  registry.set(adapter.name, adapter);
}

export function getAdapter(name: string): Adapter | undefined {
  return registry.get(name);
}

export function listAdapters(): Adapter[] {
  return Array.from(registry.values());
}

registerAdapter(arxivAdapter);
registerAdapter(exaAdapter);
registerAdapter(perplexityAdapter);

export { arxivAdapter, exaAdapter, perplexityAdapter };
