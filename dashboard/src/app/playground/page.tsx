'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppShell } from '@/components/shell';
import { Loader2, Gauge, Download, Sparkles } from 'lucide-react';
import { engineFromToolName } from '@/lib/engines';
import { urlShareCounts } from '@/lib/eval';
import { deriveMetrics, type EngineResult } from '@/lib/metrics';
import { Scoreboard } from '@/components/playground/Scoreboard';
import { EngineMetricCard } from '@/components/playground/EngineMetricCard';
import { ResultDetail } from '@/components/playground/ResultDetail';
import { SearchQualityCard } from '@/components/playground/SearchQualityCard';

const JUDGE_ENABLED = process.env.NEXT_PUBLIC_JUDGE_ENABLED === '1';

export default function PlaygroundPage() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Record<string, EngineResult> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [engines, setEngines] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(true);
  const [enginesError, setEnginesError] = useState<string | null>(null);

  // 우측 상세에 표시할 엔진
  const [activeEngine, setActiveEngine] = useState<string | null>(null);
  // judge 다축 점수 (엔진 -> AxisScore)
  const [relevance, setRelevance] = useState<Record<string, import('@/lib/judge-spans').AxisScore> | null>(null);
  const [authority, setAuthority] = useState<Record<string, import('@/lib/judge-spans').AxisScore> | null>(null);
  const [judged, setJudged] = useState(false);
  const [judgeLoading, setJudgeLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mcp/list');
        const data = await res.json();
        if (!res.ok) throw new Error(data.details || data.error || 'Failed to list tools');
        const found = [
          ...new Set(
            (data.tools as Array<{ name: string }>)
              .map((t) => engineFromToolName(t.name))
              .filter((e): e is string => e !== null),
          ),
        ];
        setEngines(found);
        setSelected(found);
      } catch (err) {
        setEnginesError(err instanceof Error ? err.message : String(err));
      } finally {
        setEnginesLoading(false);
      }
    })();
  }, []);

  const toggleEngine = (engine: string) => {
    setSelected((prev) =>
      prev.includes(engine) ? prev.filter((e) => e !== engine) : [...prev, engine],
    );
  };

  const allSelected = engines.length > 0 && selected.length === engines.length;
  const toggleAll = () => setSelected(allSelected ? [] : engines);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setRelevance(null);
    setAuthority(null);
    setJudged(false);
    try {
      const response = await fetch('/api/mcp/parallel-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Anthropic의 first-party web_search는 1회 검색당 ~5건만 반환하고 개수 지정이
        // 불가능하므로, 엔진 간 공정한 비교를 위해 전 엔진을 5건으로 통일한다.
        body: JSON.stringify({ query, num_results: 5, engines: selected }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.details || data.error || 'Search failed');
        setResults(null);
      } else {
        setResults(data);
        const firstOk = Object.keys(data).find((e) => Array.isArray(data[e]?.results));
        setActiveEngine(firstOk ?? Object.keys(data)[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJudge = async () => {
    if (!results) return;
    setJudgeLoading(true);
    setJudged(false);
    try {
      const enginesPayload: Record<string, Array<{ title?: string; url?: string; snippet?: string }>> = {};
      for (const [engine, r] of Object.entries(results)) {
        if (Array.isArray(r.results)) {
          enginesPayload[engine] = r.results.map((x) => ({
            title: x.title,
            url: x.url,
            snippet: x.snippet,
          }));
        }
      }
      const res = await fetch('/api/eval/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, engines: enginesPayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.details || data.error || 'AI 품질 평가 실패');
      } else {
        setRelevance(data.relevance ?? null);
        setAuthority(data.authority ?? null);
        setJudged(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJudgeLoading(false);
    }
  };

  const handleExport = () => {
    if (!results) return;
    const json = JSON.stringify(results, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-results-${Date.now()}.json`;
    a.click();
  };

  const metrics = useMemo(
    () => (results ? deriveMetrics(results) : []),
    [results],
  );

  const shareCounts = useMemo(() => {
    if (!results) return new Map<string, number>();
    const urls: Record<string, string[]> = {};
    for (const [engine, r] of Object.entries(results)) {
      if (Array.isArray(r.results)) {
        urls[engine] = r.results.map((x) => x.url ?? '').filter(Boolean);
      }
    }
    return urlShareCounts(urls);
  }, [results]);

  return (
    <AppShell title="Search Playground" description="검색 엔진별 latency·품질 비교" icon={Gauge}>
      <div>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Multi-Engine Search</CardTitle>
            <CardDescription>활성화된 검색 엔진의 결과를 한눈에 비교</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="query">검색어</Label>
              <Input
                id="query"
                placeholder="검색어를 입력하세요..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>검색 엔진</Label>
                {engines.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {allSelected ? '전체 해제' : '전체 선택'}
                  </button>
                )}
              </div>
              {enginesLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : enginesError ? (
                <p className="text-sm text-destructive">{enginesError}</p>
              ) : engines.length === 0 ? (
                <p className="text-sm text-muted-foreground">활성화된 검색 엔진이 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {engines.map((engine) => (
                    <Button
                      key={engine}
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`h-7 rounded-full px-3 text-xs capitalize ${
                        selected.includes(engine)
                          ? 'border-primary/30 bg-primary/15 text-primary hover:bg-primary/15'
                          : ''
                      }`}
                      onClick={() => toggleEngine(engine)}
                    >
                      {engine}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSearch}
                disabled={isLoading || selected.length === 0}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    검색 중...
                  </>
                ) : (
                  '검색'
                )}
              </Button>
              {results && (
                <Button variant="outline" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  내보내기
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {results && (
          <>
            <Card className="mb-6">
              <CardContent className="py-4">
                <Scoreboard metrics={metrics} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">엔진별 메트릭</CardTitle>
                  <CardDescription>클릭하면 오른쪽에 결과가 표시됩니다</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {metrics.map((m) => (
                    <EngineMetricCard
                      key={m.engine}
                      m={m}
                      selected={activeEngine === m.engine}
                      onSelect={() => setActiveEngine(m.engine)}
                    />
                  ))}
                  {JUDGE_ENABLED && (
                    <Button
                      variant="secondary"
                      className="mt-2 w-full"
                      onClick={handleJudge}
                      disabled={judgeLoading}
                    >
                      {judgeLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          평가 중...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          AI 품질 평가 실행
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base capitalize">
                    {activeEngine ?? '결과'} 결과 상세
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-h-0 flex-1">
                  <ResultDetail
                    data={activeEngine ? results[activeEngine] : undefined}
                    shareCounts={shareCounts}
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">검색 품질 상세</CardTitle>
                <CardDescription>
                  엔진별 5개 축 비교 — Relevance가 가장 중요합니다. AI 평가를 실행하면
                  Relevance·Authority 점수와 판단 근거가 채워집니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SearchQualityCard
                  results={results}
                  relevance={relevance}
                  authority={authority}
                  judged={judged}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
