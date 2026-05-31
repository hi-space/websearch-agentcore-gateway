export const WEB_SEARCH_SUFFIX = '___web_search';

export function engineFromToolName(name: string): string | null {
  return name.endsWith(WEB_SEARCH_SUFFIX)
    ? name.slice(0, -WEB_SEARCH_SUFFIX.length)
    : null;
}

export interface SearchTool {
  name: string;
  engine: string;
}

/**
 * 선택된 엔진만 남긴다. selection이 없거나 비어 있으면 전체 반환(하위 호환).
 */
export function filterEnginesBySelection<T extends SearchTool>(
  tools: T[],
  selection: string[] | undefined,
): T[] {
  if (!selection || selection.length === 0) return tools;
  return tools.filter((t) => selection.includes(t.engine));
}
