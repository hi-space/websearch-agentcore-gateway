// dashboard/src/components/playground/SearchQualityCard.tsx
'use client';

import { Fragment, useState } from 'react';
import { Info } from 'lucide-react';
import { type EngineResult } from '@/lib/metrics';
import { type AxisScore } from '@/lib/judge-spans';
import { computeDiversity, computeFreshness } from '@/lib/quality-metrics';
import { humanizeLatency } from '@/lib/eval';

interface SearchQualityCardProps {
  results: Record<string, EngineResult>;
  relevance: Record<string, AxisScore> | null;
  authority: Record<string, AxisScore> | null;
  judged: boolean;
}

interface Row {
  engine: string;
  hasError: boolean;
  relevance: AxisScore | null;
  authority: AxisScore | null;
  diversity: number | null;
  freshness: { score: number | null; dated: number; total: number };
  latencyMs: number | null;
}

function buildRows(props: SearchQualityCardProps): Row[] {
  return Object.entries(props.results).map(([engine, r]) => {
    const arr = Array.isArray(r.results) ? r.results : [];
    const urls = arr.map((x) => x.url ?? '').filter(Boolean);
    const publishedAts = arr.map((x) => x.published_at);
    return {
      engine,
      hasError: !!r.isError || !!r.error || !Array.isArray(r.results),
      relevance: props.relevance?.[engine] ?? null,
      authority: props.authority?.[engine] ?? null,
      diversity: computeDiversity(urls),
      freshness: computeFreshness(publishedAts, Date.now()),
      latencyMs: typeof r.latency_ms === 'number' ? r.latency_ms : null,
    };
  });
}

// 해당 축에서 최고(또는 latency는 최저) 엔진 집합. 동점이면 복수 강조.
function bestEngines(rows: Row[], pick: (r: Row) => number | null, lowerIsBetter = false): Set<string> {
  const vals = rows.map((r) => pick(r)).filter((v): v is number => v !== null);
  if (vals.length === 0) return new Set();
  const best = lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
  return new Set(rows.filter((r) => pick(r) === best).map((r) => r.engine));
}

export function SearchQualityCard(props: SearchQualityCardProps) {
  const rows = buildRows(props);
  const [open, setOpen] = useState<string | null>(null); // `${engine}:${axis}`

  const bestRel = bestEngines(rows, (r) => r.relevance?.value ?? null);
  const bestAuth = bestEngines(rows, (r) => r.authority?.value ?? null);
  const bestDiv = bestEngines(rows, (r) => r.diversity);
  const bestFresh = bestEngines(rows, (r) => r.freshness.score);
  const bestLat = bestEngines(rows, (r) => r.latencyMs, true);

  const judgeCell = (engine: string, axis: 'relevance' | 'authority', s: AxisScore | null, best: boolean) => {
    if (s === null) {
      return <span className="text-muted-foreground">{props.judged ? '평가 안 됨' : '평가 전'}</span>;
    }
    const key = `${engine}:${axis}`;
    return (
      <span className="inline-flex items-center gap-1">
        <span className={best ? 'font-semibold text-primary' : ''}>{s.value.toFixed(2)}</span>
        {(s.explanation || s.label) && (
          <button
            type="button"
            onClick={() => setOpen(open === key ? null : key)}
            className="text-muted-foreground hover:text-foreground"
            title="LLM 판단 근거 보기"
          >
            <Info className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1.5 text-left">엔진</th>
            <th className="px-2 py-1.5 text-right font-bold text-foreground">Relevance</th>
            <th className="px-2 py-1.5 text-right">Authority</th>
            <th className="px-2 py-1.5 text-right">Diversity</th>
            <th className="px-2 py-1.5 text-right">Freshness</th>
            <th className="px-2 py-1.5 text-right">Latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const relKey = `${row.engine}:relevance`;
            const authKey = `${row.engine}:authority`;
            const expanded =
              open === relKey ? row.relevance : open === authKey ? row.authority : null;
            return (
              <Fragment key={row.engine}>
                <tr className="border-b last:border-0">
                  <td className="px-2 py-1.5 capitalize">{row.engine}</td>
                  {row.hasError ? (
                    <td colSpan={5} className="px-2 py-1.5 text-right text-destructive">오류</td>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {judgeCell(row.engine, 'relevance', row.relevance, bestRel.has(row.engine))}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {judgeCell(row.engine, 'authority', row.authority, bestAuth.has(row.engine))}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${bestDiv.has(row.engine) ? 'font-semibold text-primary' : ''}`}>
                        {row.diversity === null ? '—' : row.diversity.toFixed(2)}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${bestFresh.has(row.engine) ? 'font-semibold text-primary' : ''}`}>
                        {row.freshness.score === null
                          ? '—'
                          : `${row.freshness.score.toFixed(2)} (${row.freshness.dated}/${row.freshness.total})`}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${bestLat.has(row.engine) ? 'font-semibold text-primary' : ''}`}>
                        {row.latencyMs === null ? '—' : humanizeLatency(row.latencyMs)}
                      </td>
                    </>
                  )}
                </tr>
                {expanded && (expanded.explanation || expanded.label) && (
                  <tr className="border-b last:border-0 bg-muted/40">
                    <td colSpan={6} className="px-2 py-2 text-xs text-muted-foreground">
                      {expanded.label && <span className="font-medium text-foreground">{expanded.label}: </span>}
                      {expanded.explanation}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-2 text-[11px] text-muted-foreground">
        Relevance·Authority는 AgentCore LLM 평가자(0~1) 채점 · Diversity는 고유 도메인 비율 ·
        Freshness는 게시일 중앙값 기반(괄호=날짜 있는 결과수) · Latency는 응답 속도.
      </p>
    </div>
  );
}
