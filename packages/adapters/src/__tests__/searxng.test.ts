import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import nock from 'nock';
import { ErrorCode } from '@search-gateway/shared';
import { searxngAdapter } from '../searxng.js';

beforeAll(() => { nock.disableNetConnect(); });
afterEach(() => { nock.cleanAll(); });
afterAll(() => { nock.enableNetConnect(); });

describe('Adapter contract: searxng', () => {
  it('has a non-empty name and a valid category', () => {
    expect(searxngAdapter.name.length).toBeGreaterThan(0);
    expect(['web', 'academic']).toContain(searxngAdapter.category);
  });

  it('rejects empty queries with INVALID_ARGUMENT', async () => {
    await expect(searxngAdapter.search('')).rejects.toMatchObject({
      code: ErrorCode.INVALID_ARGUMENT
    });
  });

  it('returns Zod-valid SearchResult[] for a successful query', async () => {
    nock('http://localhost:8080')
      .get('/search')
      .query(true)
      .reply(200, {
        results: [
          { title: 'Result 1', url: 'http://example.com/1', content: 'Content 1' },
          { title: 'Result 2', url: 'http://example.com/2', content: 'Content 2' }
        ]
      }, { 'Content-Type': 'application/json' });

    const results = await searxngAdapter.search('quantum computing', { baseUrl: 'http://localhost:8080' });
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(r.url).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(typeof r.snippet).toBe('string');
      expect(r.provider).toBe('searxng');
    }
  });

  it('maps timeouts to UPSTREAM_TIMEOUT', async () => {
    nock('http://localhost:8080')
      .get('/search')
      .query(true)
      .delayConnection(10_000)
      .reply(200, '');

    await expect(searxngAdapter.search('q', { baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_TIMEOUT
    });
  });
});

describe('searxngAdapter (specifics)', () => {
  it('throws INTERNAL when baseUrl is missing', async () => {
    await expect(searxngAdapter.search('q')).rejects.toMatchObject({
      code: ErrorCode.INTERNAL
    });
  });

  it('maps a 5xx upstream response to UPSTREAM_ERROR', async () => {
    nock('http://localhost:8080')
      .get('/search')
      .query(true)
      .reply(503, '');
    await expect(searxngAdapter.search('q', { baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_ERROR
    });
  });

  it('maps results to correct schema with provider and rank', async () => {
    const successJson = {
      results: [
        { title: 'First', url: 'http://ex1.com', content: 'Content 1' },
        { title: 'Second', url: 'http://ex2.com', content: 'Content 2' },
        { title: 'Third', url: 'http://ex3.com', content: 'Content 3' }
      ]
    };
    nock('http://localhost:8080')
      .get('/search')
      .query(true)
      .reply(200, successJson, { 'Content-Type': 'application/json' });

    const results = await searxngAdapter.search('test', { baseUrl: 'http://localhost:8080', topK: 10 });

    expect(results).toHaveLength(3);
    expect(results[0]!.title).toBe('First');
    expect(results[0]!.url).toBe('http://ex1.com');
    expect(results[0]!.snippet).toBe('Content 1');
    expect(results[0]!.provider).toBe('searxng');
    expect(results[0]!.rank).toBe(1);
    expect(results[0]!.score).toBeUndefined();

    expect(results[1]!.title).toBe('Second');
    expect(results[1]!.rank).toBe(2);
    expect(results[2]!.title).toBe('Third');
    expect(results[2]!.rank).toBe(3);
  });
});
