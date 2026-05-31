import { describe, it, expect } from 'vitest';
import { engineFromToolName, filterEnginesBySelection } from './engines';

describe('engineFromToolName', () => {
  it('extracts engine name from a web_search tool', () => {
    expect(engineFromToolName('serper___web_search')).toBe('serper');
  });

  it('returns null for non web_search tools', () => {
    expect(engineFromToolName('serper___news')).toBeNull();
    expect(engineFromToolName('random')).toBeNull();
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
