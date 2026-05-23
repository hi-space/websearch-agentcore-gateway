import type { Adapter } from '@search-gateway/shared';

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
