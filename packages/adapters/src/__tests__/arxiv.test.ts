import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ErrorCode } from '@search-gateway/shared';
import { arxivAdapter } from '../arxiv.js';
import { runAdapterContract } from './contract.test.js';

const here = dirname(fileURLToPath(import.meta.url));
const successXml = readFileSync(resolve(here, '__fixtures__/arxiv-success.xml'), 'utf8');

beforeAll(() => { nock.disableNetConnect(); });
afterEach(() => { nock.cleanAll(); });
afterAll(() => { nock.enableNetConnect(); });

runAdapterContract(arxivAdapter, {
  successCase: () => {
    nock('https://export.arxiv.org')
      .get('/api/query')
      .query(true)
      .reply(200, successXml, { 'Content-Type': 'application/atom+xml' });
  },
  timeoutCase: () => {
    nock('https://export.arxiv.org')
      .get('/api/query')
      .query(true)
      .delayConnection(10_000)
      .reply(200, '');
  }
});

describe('arxivAdapter (specifics)', () => {
  it('parses two entries with correct titles and arXiv IDs', async () => {
    nock('https://export.arxiv.org')
      .get('/api/query')
      .query(true)
      .reply(200, successXml, { 'Content-Type': 'application/atom+xml' });
    const results = await arxivAdapter.search('quantum');
    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe('Quantum Computing Breakthrough');
    expect(results[0]!.url).toBe('http://arxiv.org/abs/2401.00001v1');
    expect(results[0]!.provider).toBe('arxiv');
  });

  it('maps a 5xx upstream to UPSTREAM_ERROR', async () => {
    nock('https://export.arxiv.org').get('/api/query').query(true).reply(503, '');
    await expect(arxivAdapter.search('q')).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_ERROR
    });
  });

  it('handles entries with missing optional fields without crashing', async () => {
    const partialXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.99999v1</id>
    <published>2026-03-01T00:00:00Z</published>
  </entry>
</feed>`;
    nock('https://export.arxiv.org')
      .get('/api/query')
      .query(true)
      .reply(200, partialXml, { 'Content-Type': 'application/atom+xml' });
    const results = await arxivAdapter.search('q');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('');
    expect(results[0]!.snippet).toBe('');
  });
});
