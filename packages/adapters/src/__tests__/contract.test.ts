import { describe, it, expect } from 'vitest';
import type { Adapter } from '@search-gateway/shared';
import { ErrorCode, SearchError, SearchResult } from '@search-gateway/shared';

export function runAdapterContract(adapter: Adapter, runtime: {
  successCase: () => Promise<void> | void;
  authFailureCase?: () => Promise<void> | void;
  timeoutCase?: () => Promise<void> | void;
}): void {
  describe(`Adapter contract: ${adapter.name}`, () => {
    it('has a non-empty name and a valid category', () => {
      expect(adapter.name.length).toBeGreaterThan(0);
      expect(['web', 'academic']).toContain(adapter.category);
    });

    it('rejects empty queries with INVALID_ARGUMENT', async () => {
      await expect(adapter.search('')).rejects.toMatchObject({
        code: ErrorCode.INVALID_ARGUMENT
      });
    });

    it('returns Zod-valid SearchResult[] for a successful query', async () => {
      await runtime.successCase();
      const results = await adapter.search('quantum computing');
      expect(Array.isArray(results)).toBe(true);
      for (const r of results) SearchResult.parse(r);
    });

    if (runtime.authFailureCase) {
      it('maps auth failures to UPSTREAM_AUTH', async () => {
        await runtime.authFailureCase!();
        await expect(adapter.search('q')).rejects.toMatchObject({
          code: ErrorCode.UPSTREAM_AUTH
        });
      });
    }

    if (runtime.timeoutCase) {
      it('maps timeouts to UPSTREAM_TIMEOUT', async () => {
        await runtime.timeoutCase!();
        await expect(adapter.search('q')).rejects.toMatchObject({
          code: ErrorCode.UPSTREAM_TIMEOUT
        });
      });
    }
  });
}
