'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { SearchPill } from '../ui/SearchPill';
import { PillTabs, type PillTabItem } from '../ui/PillTab';
import { Pagination } from '../ui/Pagination';
import { EmptyState } from '../ui/EmptyState';
import type { ProviderRow } from '../lib/api';

type Filter = 'all' | 'enabled' | 'disabled' | 'no-secret';

const PAGE_SIZE = 8;

export function ProviderList({ rows }: { rows: ProviderRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.providerId.toLowerCase().includes(q)) return false;
      if (filter === 'enabled' && !r.enabled) return false;
      if (filter === 'disabled' && r.enabled) return false;
      if (filter === 'no-secret' && r.hasSecret) return false;
      return true;
    });
  }, [rows, query, filter]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      enabled: rows.filter((r) => r.enabled).length,
      disabled: rows.filter((r) => !r.enabled).length,
      'no-secret': rows.filter((r) => !r.hasSecret).length
    }),
    [rows]
  );

  const items: PillTabItem<Filter>[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'enabled', label: 'Enabled', count: counts.enabled },
    { id: 'disabled', label: 'Disabled', count: counts.disabled },
    { id: 'no-secret', label: 'Missing secret', count: counts['no-secret'] }
  ];

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Card>
      <CardHeader
        title="Providers"
        subtitle="Toggle availability, set quotas, and rotate API credentials. Changes are audited."
        action={
          <Button variant="primary" disabled title="Provider provisioning is managed via CDK seed in v1.0">
            Add provider
          </Button>
        }
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <SearchPill
          aria-label="Search providers"
          placeholder="Search providers"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          className="w-full md:max-w-xs"
        />
        <PillTabs
          items={items}
          active={filter}
          onChange={(id) => {
            setFilter(id);
            setPage(1);
          }}
          ariaLabel="Filter providers"
        />
      </div>

      {slice.length === 0 ? (
        <EmptyState
          title="No providers match"
          description={query ? `No provider matches “${query}”. Try a different filter.` : 'Adjust filters to see providers.'}
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
        <div className="overflow-hidden rounded-md border border-hairline">
          <table className="w-full text-body-sm">
            <thead className="bg-surface text-caption-bold text-steel uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Provider</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Secret</th>
                <th className="text-right px-5 py-3 font-semibold">RPM</th>
                <th className="text-right px-5 py-3 font-semibold">Daily</th>
                <th className="text-right px-5 py-3 font-semibold">Timeout</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.providerId} className="border-t border-hairline-soft hover:bg-surfaceSoft">
                  <td className="px-5 py-3 font-medium text-ink">
                    <span className="inline-flex items-center gap-2">
                      <ProviderDot id={r.providerId} />
                      {r.providerId}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={r.enabled ? 'success' : 'neutral'}>
                      {r.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {r.hasSecret ? (
                      <Badge tone="tag-green">stored</Badge>
                    ) : (
                      <Badge tone="warning">no secret</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-ink tabular-nums">{r.quota.rpm}</td>
                  <td className="px-5 py-3 text-right text-ink tabular-nums">{r.quota.daily}</td>
                  <td className="px-5 py-3 text-right text-ink tabular-nums">{r.timeoutMs} ms</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/providers/${r.providerId}`} className="text-linkBlue text-body-sm-medium hover:underline">
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
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

const PROVIDER_TINTS = ['#5645d4', '#dd5b00', '#ff64c8', '#1aae39', '#2a9d99', '#7b3ff2'];

function ProviderDot({ id }: { id: string }) {
  // Stable color per provider id.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const color = PROVIDER_TINTS[Math.abs(h) % PROVIDER_TINTS.length];
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}
