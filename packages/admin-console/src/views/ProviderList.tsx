import React from 'react';
import Link from 'next/link';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import type { ProviderRow } from '../lib/api.js';

export function ProviderList({ rows }: { rows: ProviderRow[] }) {
  return (
    <Card>
      <h1 className="text-2xl font-semibold mb-6">Providers</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-slate">
          <tr>
            <th className="pb-3">Provider</th>
            <th className="pb-3">Status</th>
            <th className="pb-3">Secret</th>
            <th className="pb-3">RPM</th>
            <th className="pb-3">Daily</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.providerId} className="border-t border-hairline">
              <td className="py-3 font-medium">{r.providerId}</td>
              <td>
                <Badge tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </td>
              <td>{r.hasSecret ? <Badge tone="success">stored</Badge> : <Badge tone="warning">no secret</Badge>}</td>
              <td>{r.quota.rpm}</td>
              <td>{r.quota.daily}</td>
              <td>
                <Link className="text-link-blue text-sm" href={`/admin/providers/${r.providerId}`}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
