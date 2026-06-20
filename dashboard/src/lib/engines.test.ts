import { describe, it, expect } from 'vitest';
import {
  engineFromToolName,
  filterEnginesBySelection,
  buildToolArgs,
  normalizeConnectorResponse,
  parseConnectorDate,
  CONNECTOR_ENGINE,
} from './engines';

describe('engineFromToolName', () => {
  it('extracts engine name from a web_search tool', () => {
    expect(engineFromToolName('serper___web_search')).toBe('serper');
  });

  it('maps the AgentCore connector tool to the agentcore engine', () => {
    expect(engineFromToolName('web-search___WebSearch')).toBe('agentcore');
  });

  it('returns null for non web_search tools', () => {
    expect(engineFromToolName('serper___news')).toBeNull();
    expect(engineFromToolName('random')).toBeNull();
    // 커넥터의 ___WebSearch 접미사는 일반 매핑으로는 잡히지 않아야 한다(특수 케이스만 인정).
    expect(engineFromToolName('other___WebSearch')).toBeNull();
  });
});

describe('buildToolArgs', () => {
  it('uses num_results/country for Lambda engines', () => {
    expect(buildToolArgs('serper', { query: 'q', num_results: 5, country: 'KR' })).toEqual({
      query: 'q',
      num_results: 5,
      country: 'KR',
    });
  });

  it('omits country when not provided', () => {
    expect(buildToolArgs('serper', { query: 'q', num_results: 5 })).toEqual({
      query: 'q',
      num_results: 5,
    });
  });

  it('maps num_results to maxResults for the AgentCore connector', () => {
    expect(buildToolArgs(CONNECTOR_ENGINE, { query: 'q', num_results: 5, country: 'KR' })).toEqual({
      query: 'q',
      maxResults: 5,
    });
  });
});

describe('parseConnectorDate', () => {
  it("parses the connector's non-ISO format to YYYY-MM-DD", () => {
    expect(parseConnectorDate('12:45PM, Tuesday, June 16 2026, PDT')).toBe('2026-06-16');
    expect(parseConnectorDate('04:46AM, Wednesday, September 03 2025, PDT')).toBe('2025-09-03');
  });

  it('returns undefined for unknown/unparseable values', () => {
    expect(parseConnectorDate('unknown')).toBeUndefined();
    expect(parseConnectorDate(null)).toBeUndefined();
    expect(parseConnectorDate(undefined)).toBeUndefined();
    expect(parseConnectorDate('')).toBeUndefined();
  });
});

describe('normalizeConnectorResponse', () => {
  it('maps text->snippet and converts publishedDate to ISO date', () => {
    const out = normalizeConnectorResponse({
      results: [
        {
          title: 'AgentCore',
          url: 'https://aws.amazon.com/bedrock/agentcore/',
          text: 'The platform for production AI agents.',
          publishedDate: '06:21PM, Thursday, June 18 2026, PDT',
        },
      ],
    });
    expect(out.results).toEqual([
      {
        title: 'AgentCore',
        url: 'https://aws.amazon.com/bedrock/agentcore/',
        snippet: 'The platform for production AI agents.',
        published_at: '2026-06-18',
      },
    ]);
  });

  it('drops items missing title or url (structured-data blobs)', () => {
    const out = normalizeConnectorResponse({
      results: [
        { title: 'ok', url: 'https://example.com', text: 't' },
        { title: null, url: null, text: '| event | blob |' },
        { title: 'no-url', url: '' },
      ],
    });
    expect(out.results.map((r) => r.title)).toEqual(['ok']);
  });

  it('omits published_at for non-ISO/unknown dates', () => {
    const out = normalizeConnectorResponse({
      results: [{ title: 't', url: 'https://x.com', publishedDate: 'unknown' }],
    });
    expect(out.results[0].published_at).toBeUndefined();
  });

  it('returns empty results for malformed payloads', () => {
    expect(normalizeConnectorResponse(null).results).toEqual([]);
    expect(normalizeConnectorResponse({}).results).toEqual([]);
    expect(normalizeConnectorResponse({ results: 'nope' }).results).toEqual([]);
  });
});

describe('filterEnginesBySelection', () => {
  const tools = [
    { name: 'serper___web_search', engine: 'serper' },
    { name: 'exa___web_search', engine: 'exa' },
    { name: 'perplexity___web_search', engine: 'perplexity' },
  ];

  it('returns only selected engines', () => {
    expect(filterEnginesBySelection(tools, ['exa']).map((t) => t.engine)).toEqual(['exa']);
  });

  it('returns all tools when selection is undefined (backward compatible)', () => {
    expect(filterEnginesBySelection(tools, undefined)).toEqual(tools);
  });

  it('returns all tools when selection is empty (backward compatible)', () => {
    expect(filterEnginesBySelection(tools, [])).toEqual(tools);
  });

  it('ignores unknown engine names', () => {
    expect(filterEnginesBySelection(tools, ['nope'])).toEqual([]);
  });
});
