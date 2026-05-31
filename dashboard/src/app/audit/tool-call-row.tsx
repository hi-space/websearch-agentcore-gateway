'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import JsonView from '@uiw/react-json-view';

// Mirror of the server ToolCall shape (the API returns this as JSON).
export interface ToolCall {
  traceId: string;
  spanId: string | null;
  timestamp: string;
  tool: string | null;
  toolFull: string | null;
  method: string | null;
  isListing: boolean;
  args: Record<string, unknown>;
  query: string | null;
  status: 'success' | 'tool-error' | 'gateway-error';
  errorMessage: string | null;
  response: string | null;
  latencyMs: number | null;
  raw: unknown[];
}

// The tool's result text is real JSON; pretty-print it when possible so the
// response section is readable. Falls back to the raw string when it isn't JSON.
function formatResponse(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const STATUS_META = {
  success: { Icon: CheckCircle2, label: '성공', color: 'text-emerald-600', border: 'border-emerald-600/40', bg: 'bg-emerald-500/5' },
  'tool-error': { Icon: AlertTriangle, label: '도구 에러', color: 'text-amber-600', border: 'border-amber-500/50', bg: 'bg-amber-500/10' },
  'gateway-error': { Icon: XCircle, label: '게이트웨이 에러', color: 'text-red-600', border: 'border-red-600/50', bg: 'bg-red-500/5' },
} as const;

function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatTime(iso: string): string {
  // Show HH:MM:SS in local time; fall back to the raw string.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

export function ToolCallRow({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const meta = STATUS_META[call.status];
  const { Icon } = meta;
  const toolLabel = call.tool ?? (call.isListing ? 'tools/list' : '알 수 없음');

  return (
    <div className={`border rounded-lg p-3 transition-colors ${meta.border} ${meta.bg}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-foreground/10 text-foreground shrink-0">
          {toolLabel}
        </span>
        <span className={`flex items-center gap-1 text-xs shrink-0 ${meta.color}`}>
          <Icon className="h-3.5 w-3.5" /> {meta.label}
        </span>
        <span className="flex-1 min-w-0 truncate font-mono text-sm text-muted-foreground">
          {call.errorMessage ? call.errorMessage : call.query ? `query="${call.query}"` : ''}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{formatLatency(call.latencyMs)}</span>
        <span className="text-xs text-muted-foreground shrink-0">{formatTime(call.timestamp)}</span>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-3 text-sm">
          <section>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">요청</p>
            <div className="font-mono text-xs bg-muted/50 rounded p-2 space-y-0.5">
              <div>method: {call.method ?? '—'}</div>
              {call.toolFull && <div>tool: {call.toolFull}</div>}
              {Object.entries(call.args).map(([k, v]) => (
                <div key={k}>
                  {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              {call.status === 'success' ? '응답' : '에러'}
            </p>
            <div className={`font-mono text-xs rounded p-2 ${call.status === 'success' ? 'bg-muted/50' : 'bg-red-500/5 text-red-600'}`}>
              {call.status === 'success' ? (
                call.response ? (
                  <pre className="whitespace-pre-wrap break-all max-h-80 overflow-auto">{formatResponse(call.response)}</pre>
                ) : (
                  '성공적으로 처리됨'
                )
              ) : (
                call.errorMessage ?? '성공적으로 처리됨'
              )}
            </div>
          </section>

          <section>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">메타</p>
            <div className="font-mono text-xs text-muted-foreground break-all">
              trace_id: {call.traceId} · span_id: {call.spanId ?? '—'}
            </div>
          </section>

          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs text-primary underline"
          >
            {showRaw ? '원본 JSON 숨기기' : '원본 JSON 보기'}
          </button>
          {showRaw && (
            <div className="bg-muted/50 rounded p-2 overflow-auto max-h-64">
              <JsonView value={{ raw: call.raw }} className="text-xs !bg-transparent" collapsed={2} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
