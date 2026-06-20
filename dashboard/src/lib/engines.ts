export const WEB_SEARCH_SUFFIX = '___web_search';

// AgentCore 관리형 Web Search 커넥터 타깃. Lambda 엔진들과 달리 도구명 접미사가
// `___WebSearch`(대문자)이고, 입력은 maxResults, 응답은 {title,url,text,publishedDate}
// 형태라 별도 매핑/정규화가 필요하다. (scripts/create-web-search-target.sh 참고)
export const CONNECTOR_WEB_SEARCH_TOOL = 'web-search___WebSearch';
export const CONNECTOR_ENGINE = 'agentcore';

export function engineFromToolName(name: string): string | null {
  if (name === CONNECTOR_WEB_SEARCH_TOOL) return CONNECTOR_ENGINE;
  return name.endsWith(WEB_SEARCH_SUFFIX)
    ? name.slice(0, -WEB_SEARCH_SUFFIX.length)
    : null;
}

/**
 * 엔진별 tools/call 인자를 만든다. AgentCore 커넥터는 num_results 대신 maxResults를
 * 쓰고 country를 모르므로, 엔진 간 공정 비교를 위해 num_results를 maxResults로 매핑한다.
 */
export function buildToolArgs(
  engine: string,
  params: { query: string; num_results: number; country?: string },
): Record<string, unknown> {
  const { query, num_results, country } = params;
  if (engine === CONNECTOR_ENGINE) {
    return { query, maxResults: num_results };
  }
  const args: Record<string, unknown> = { query, num_results };
  if (country) args.country = country;
  return args;
}

interface ConnectorResultItem {
  title?: string | null;
  url?: string | null;
  text?: string | null;
  publishedDate?: string | null;
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * 커넥터의 publishedDate를 YYYY-MM-DD로 변환한다. 값은 "12:45PM, Tuesday, June 16
 * 2026, PDT"처럼 Date.parse가 못 읽는 비표준 포맷이거나 "unknown"일 수 있다.
 * 월/일/년을 직접 뽑아 ISO 날짜로 만들고, 못 읽으면 undefined를 반환한다.
 */
export function parseConnectorDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\b/);
  if (!m) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return undefined;
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
}

/**
 * AgentCore Web Search 커넥터 응답을 대시보드 공통 SearchResponse 형태로 정규화한다.
 * - text -> snippet, publishedDate -> published_at(ISO로 파싱되는 값만)
 * - title/url이 비어 있는 구조화 데이터 블롭은 결과에서 제외한다.
 */
export function normalizeConnectorResponse(data: unknown): {
  results: Array<{ title: string; url: string; snippet?: string; published_at?: string }>;
} {
  const items =
    data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
      ? ((data as { results: ConnectorResultItem[] }).results)
      : [];

  const results = items
    .filter((r) => r && typeof r.title === 'string' && typeof r.url === 'string' && r.title && r.url)
    .map((r) => {
      const item: { title: string; url: string; snippet?: string; published_at?: string } = {
        title: r.title as string,
        url: r.url as string,
      };
      if (typeof r.text === 'string' && r.text) item.snippet = r.text;
      // publishedDate는 "06:21PM, Thursday, June 18 2026, PDT"처럼 Date.parse가 못
      // 읽는 포맷이거나 "unknown"일 수 있다. ISO 날짜로 변환되는 값만 넘긴다.
      const published = parseConnectorDate(r.publishedDate);
      if (published) item.published_at = published;
      return item;
    });

  return { results };
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
