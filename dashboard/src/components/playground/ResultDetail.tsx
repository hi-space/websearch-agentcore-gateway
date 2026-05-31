'use client';

import { type EngineResult } from '@/lib/metrics';
import { normalizeUrl } from '@/lib/eval';

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
  if (results.length === 0) {
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
              <p className="min-w-0 flex-1 truncate font-medium">{r.title}</p>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-primary hover:underline"
            >
              {r.url}
            </a>
          </div>
        );
      })}
    </div>
  );
}
