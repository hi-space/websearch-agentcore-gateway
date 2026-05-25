'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { SearchPill } from '../ui/SearchPill';
import { PillTabs, type PillTabItem } from '../ui/PillTab';
import { Pagination } from '../ui/Pagination';
import { EmptyState } from '../ui/EmptyState';
import type { AuditRow } from '../lib/api';

type Filter = 'all' | 'config' | 'secret' | 'auth' | 'test';

const PAGE_SIZE = 15;

const FILTER_DEFS: Array<{ id: Filter; label: string; matches: (action: string) => boolean }> = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'config', label: 'Configuration', matches: (a) => a.startsWith('update_provider') },
  { id: 'secret', label: 'Secret', matches: (a) => a.includes('secret') || a.includes('reveal') },
  { id: 'auth', label: 'MFA & auth', matches: (a) => a.includes('mfa') || a.includes('login') },
  { id: 'test', label: 'Connectivity tests', matches: (a) => a.includes('test') }
];

function actionTone(action: string): BadgeTone {
  if (action.includes('reveal')) return 'warning';
  if (action.includes('blocked') || action.includes('failed')) return 'error';
  if (action.includes('mfa')) return 'tag-purple';
  if (action.includes('test')) return 'tag-orange';
  return 'tag-green';
}

export function AuditLog({ rows }: { rows: AuditRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const def = FILTER_DEFS.find((d) => d.id === filter)!;
    return rows.filter((r) => {
      if (!def.matches(r.action)) return false;
      if (!q) return true;
      return [r.actor, r.action, r.target].some((s) => s.toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: 0, config: 0, secret: 0, auth: 0, test: 0 };
    for (const r of rows) {
      for (const d of FILTER_DEFS) if (d.matches(r.action)) out[d.id]++;
    }
    return out;
  }, [rows]);

  const tabs: PillTabItem<Filter>[] = FILTER_DEFS.map((d) => ({ id: d.id, label: d.label, count: counts[d.id] }));

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Card variant="panel">
      <CardHeader
        title="Audit log"
        subtitle="Append-only record of every privileged change. Click a row to inspect the before/after diff."
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <SearchPill
          aria-label="Search audit log"
          placeholder="Search actor, action, target"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          className="w-full md:max-w-sm"
        />
        <PillTabs items={tabs} active={filter} onChange={(id) => { setFilter(id); setPage(1); }} ariaLabel="Filter audit actions" />
      </div>

      {slice.length === 0 ? (
        <EmptyState
          title="No audit rows match"
          description="Adjust filters or search to inspect a different slice of activity."
          action={
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                setFilter('all');
                setPage(1);
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="rounded-none border border-hairline overflow-hidden">
          <table className="w-full text-body-sm">
            <thead className="bg-surfaceSoft text-caption-sm uppercase tracking-wide text-muted">
              <tr>
                <th className="text-left px-5 py-3 font-medium w-44">Timestamp</th>
                <th className="text-left px-5 py-3 font-medium">Actor</th>
                <th className="text-left px-5 py-3 font-medium">Action</th>
                <th className="text-left px-5 py-3 font-medium">Target</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slice.map((r, i) => {
                const id = `${r.ts}-${i}`;
                const isOpen = expanded === id;
                const hasDiff = r.before !== undefined || r.after !== undefined;
                return (
                  <React.Fragment key={id}>
                    <tr className={`border-t border-hairline ${isOpen ? 'bg-surfaceSoft' : 'hover:bg-surfaceSoft'}`}>
                      <td className="px-5 py-3 font-mono text-caption-sm text-charcoal">{r.ts}</td>
                      <td className="px-5 py-3 text-ink">{r.actor}</td>
                      <td className="px-5 py-3">
                        <Badge tone={actionTone(r.action)}>{r.action}</Badge>
                      </td>
                      <td className="px-5 py-3 font-mono text-caption-sm text-ink">{r.target}</td>
                      <td className="px-5 py-3 text-right">
                        {hasDiff && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : id)}
                            className="text-ink text-body-strong hover:underline"
                          >
                            {isOpen ? 'Hide' : 'Inspect'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && hasDiff && (
                      <tr className="bg-surfaceSoft">
                        <td colSpan={5} className="px-5 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <DiffPanel label="Before" value={r.before} />
                            <DiffPanel label="After" value={r.after} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
      </div>
    </Card>
  );
}

function DiffPanel({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-none border border-hairline bg-canvas p-4">
      <div className="text-caption-sm uppercase tracking-wide text-muted mb-2">{label}</div>
      <pre className="font-mono text-caption-sm text-ink whitespace-pre-wrap break-all max-h-64 overflow-auto">
        {value === undefined || value === null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
