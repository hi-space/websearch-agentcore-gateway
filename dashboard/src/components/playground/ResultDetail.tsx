'use client';

import { type EngineResult } from '@/lib/metrics';
import { normalizeUrl } from '@/lib/eval';

// published_at은 엔진마다 ISO 날짜(Exa/Brave/Tavily)거나 상대 표현
// ("2 days ago" — Anthropic page_age)일 수 있다. ISO면 날짜만 포맷하고
// 그 외에는 원문을 그대로 보여준다.
function formatPublishedAt(value: string): string {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  return new Date(ts).toISOString().slice(0, 10);
}

export function ResultDetail({
  data,
  shareCounts,
}: {
  data: EngineResult | undefined;
  shareCounts: Map<string, number>;
}) {
  if (!data) {
    return <p className="text-sm text-muted-foreground">엔진을 선택하세요.</p>;
  }
  const hasError = data.isError || !!data.error || !Array.isArray(data.results);
  if (hasError) {
    return (
      <p className="break-words text-sm text-destructive">
        {data.error || '엔진이 오류를 반환했습니다'}
      </p>
    );
  }
  const results = data.results!;
  if (results.length === 0 && !data.answer) {
    return <p className="text-sm text-muted-foreground">반환된 결과가 없습니다.</p>;
  }

  return (
    <div className="h-full space-y-2 overflow-y-auto">
      {results.map((r, idx) => {
        const shared = r.url ? shareCounts.get(normalizeUrl(r.url)) ?? 0 : 0;
        return (
          <div key={idx} className="rounded border p-2 text-sm">
            <div className="flex items-start gap-2">
              {shared >= 2 && (
                <span
                  title={`${shared}개 엔진 공통`}
                  className="mt-0.5 shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary"
                >
                  ✓{shared}
                </span>
              )}
              {r.favicon && (
                <img
                  src={r.favicon}
                  alt=""
                  width={16}
                  height={16}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate font-medium text-primary underline hover:no-underline"
                >
                  {r.title}
                </a>
              ) : (
                <p className="min-w-0 flex-1 truncate font-medium">{r.title}</p>
              )}
            </div>
            {r.snippet && (
              <p className="line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
            )}
            {(r.published_at || typeof r.score === 'number') && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {r.published_at && <span>{formatPublishedAt(r.published_at)}</span>}
                {typeof r.score === 'number' && (
                  <span title="엔진이 매긴 관련도 점수">score {r.score.toFixed(2)}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {data.answer && (
        <details className="rounded border border-primary/30 bg-primary/5">
          <summary className="cursor-pointer select-none px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            Answer
          </summary>
          <p className="whitespace-pre-wrap px-2 pb-2 text-sm">{data.answer}</p>
        </details>
      )}
    </div>
  );
}
