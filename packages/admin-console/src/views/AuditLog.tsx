import React from 'react';
import { Card } from '../ui/Card.js';
import type { AuditRow } from '../lib/api.js';

export function AuditLog({ rows }: { rows: AuditRow[] }) {
  return (
    <Card>
      <h1 className="text-2xl font-semibold mb-6">Audit log</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-slate">
          <tr>
            <th className="pb-3">Actor</th>
            <th className="pb-3">Timestamp</th>
            <th className="pb-3">Action</th>
            <th className="pb-3">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.ts}-${i}`} className="border-t border-hairline">
              <td className="py-3">{r.actor}</td>
              <td className="py-3 text-xs font-mono">{r.ts}</td>
              <td className="py-3 font-medium">{r.action}</td>
              <td className="py-3">{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
