/**
 * Best-effort parser for the gateway's Java-style map dumps, e.g.
 * `{id=3, jsonrpc=2.0, params={name=serper, arguments={query=test}}}`.
 * The gateway logs requestBody/responseBody this way (not as JSON), so we
 * reconstruct a nested object. Anything we cannot parse degrades to a string;
 * callers must tolerate missing fields.
 */
export function parseJavaMap(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return {};
  return parseMapBody(trimmed.slice(1, -1));
}

// Parse the inside of a `{...}` (braces already stripped) into an object.
function parseMapBody(body: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let lastKey: string | null = null;
  for (const segment of splitTopLevel(body)) {
    const eq = segment.indexOf('=');
    if (eq === -1) {
      // Segment with no '=': it's a continuation of the previous value that
      // contained a top-level comma (e.g. "claude, opus, release").
      if (lastKey !== null && typeof out[lastKey] === 'string') {
        out[lastKey] = `${out[lastKey]}, ${segment.trim()}`;
      }
      continue;
    }
    const key = segment.slice(0, eq).trim();
    const rawValue = segment.slice(eq + 1).trim();
    out[key] = parseValue(rawValue);
    lastKey = key;
  }
  return out;
}

function parseValue(raw: string): unknown {
  if (raw.startsWith('{') && raw.endsWith('}')) return parseMapBody(raw.slice(1, -1));
  return raw;
}

// Split on top-level commas, respecting nested {} and [] depth.
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (start < body.length) parts.push(body.slice(start));
  return parts;
}

// --- field extraction helpers (best-effort, regex/parse based) ---

// requestBody → full tool name (params.name) for tools/call, else null.
export function extractToolName(requestBody: string): string | null {
  const parsed = parseJavaMap(requestBody);
  const method = parsed.method;
  if (method !== 'tools/call') return null;
  const params = parsed.params;
  if (params && typeof params === 'object' && 'name' in params) {
    const name = (params as Record<string, unknown>).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

// "serper___web_search" → "serper". Returns null when there is no "___".
export function extractEngine(toolName: string): string | null {
  const idx = toolName.indexOf('___');
  return idx === -1 ? null : toolName.slice(0, idx);
}

// requestBody → params.arguments object (string values), else {}.
// Note: all values are strings (Java-map parsing keeps everything as strings).
export function extractArguments(requestBody: string): Record<string, unknown> {
  const parsed = parseJavaMap(requestBody);
  const params = parsed.params;
  if (params && typeof params === 'object' && 'arguments' in params) {
    const args = (params as Record<string, unknown>).arguments;
    if (args && typeof args === 'object') return args as Record<string, unknown>;
  }
  return {};
}

// responseBody → embedded tool-level error. The tool result text is real JSON
// (e.g. `text={"results":[],"error":"..."}`), so we regex the "error" field.
// Returns null when missing or literally null.
export function extractToolError(responseBody: string): string | null {
  const m = /"error":"((?:[^"\\]|\\.)*?)"/.exec(responseBody);
  if (m && m[1]) return m[1].replace(/\\"/g, '"');
  return null;
}

// responseBody → embedded "latency_ms":<number>, else null.
export function extractLatencyMs(responseBody: string): number | null {
  const m = /"latency_ms":(\d+)/.exec(responseBody);
  return m ? Number(m[1]) : null;
}

// responseBody → the tool result's `text` payload (the real JSON the tool
// returned), else null. The result is logged as
// `content=[{type=text, text={...json...}}]`, so we locate `text=` and extract
// the balance-matched `{...}` that follows (the value itself contains nested
// braces/commas, so a flat regex won't do). Used to show the actual response
// instead of a generic "succeeded" placeholder.
export function extractResponseText(responseBody: string): string | null {
  const marker = 'text=';
  const at = responseBody.indexOf(marker);
  if (at === -1) return null;
  const start = at + marker.length;
  if (responseBody[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < responseBody.length; i++) {
    const c = responseBody[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return responseBody.slice(start, i + 1);
  }
  return null;
}

// Pretty-print a gateway body for display. The bodies are not valid JSON —
// they're Java-style map dumps (`{id=5, jsonrpc=2.0, result={...}}`) that may
// also embed real JSON inside a `text={...}` value. Rather than parse to an
// object (which would lose the embedded JSON's own quoting/arrays), we
// re-indent purely from the structural punctuation: newline + deeper indent
// after `{`/`[`, newline + shallower before `}`/`]`, newline after a top-level
// `,`. Characters inside quoted strings are emitted verbatim so commas/braces
// in values never trigger a break. Works for plain JSON too.
export function prettyPrintBody(body: string): string {
  const text = body.trim();
  if (!text) return body;

  const INDENT = '  ';
  let out = '';
  let depth = 0;
  let inString = false;
  let quote = '';

  const newline = (d: number) => '\n' + INDENT.repeat(Math.max(0, d));

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      out += c;
      // Respect backslash escapes so an escaped quote doesn't end the string.
      if (c === '\\' && i + 1 < text.length) {
        out += text[++i];
      } else if (c === quote) {
        inString = false;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      out += c;
      continue;
    }

    if (c === '{' || c === '[') {
      depth++;
      out += c + newline(depth);
    } else if (c === '}' || c === ']') {
      depth--;
      out += newline(depth) + c;
    } else if (c === ',') {
      out += ',' + newline(depth);
    } else if (c === ' ' && (out.endsWith('\n') || /\s$/.test(out))) {
      // Collapse the source's own spacing right after a structural break so we
      // don't get "{\n    id" with a stray leading space.
      continue;
    } else {
      out += c;
    }
  }

  // Tidy: drop whitespace-only lines and trailing spaces left by the source.
  const cleaned = out
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim().length > 0)
    .join('\n');

  return cleaned.length > 8000 ? cleaned.slice(0, 8000) + '\n…' : cleaned;
}

// --- types and grouping logic ---

export interface GatewayRawLine {
  // The full @message JSON string and @timestamp ISO from Logs Insights.
  message: string;
  timestamp: string;
}

export type ToolCallStatus = 'success' | 'tool-error' | 'gateway-error';

export interface ToolCall {
  traceId: string;
  spanId: string | null;
  timestamp: string; // ISO, from the first line of the trace
  tool: string | null; // engine name, e.g. "serper"; null if unparseable
  toolFull: string | null; // full name, e.g. "serper___web_search"
  method: string | null; // "tools/call" | "tools/list" | ...
  isListing: boolean; // method === "tools/list"
  args: Record<string, unknown>;
  query: string | null; // args.query, the headline argument
  status: ToolCallStatus;
  errorMessage: string | null;
  response: string | null; // the tool's actual result text (success responses)
  latencyMs: number | null;
  raw: unknown[]; // original parsed line bodies, for the JSON fallback view
}

interface ParsedLine {
  traceId: string;
  spanId: string | null;
  eventTimestamp: number; // epoch ms
  timestamp: string; // ISO
  isError: boolean;
  log: string | null;
  requestBody: string | null;
  responseBody: string | null;
  full: unknown; // the whole parsed message object (for raw view)
}

function parseLine(line: GatewayRawLine): ParsedLine | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line.message);
  } catch {
    return null;
  }
  const body = (obj.body ?? {}) as Record<string, unknown>;
  return {
    traceId: typeof obj.trace_id === 'string' ? obj.trace_id : '',
    spanId: typeof obj.span_id === 'string' ? obj.span_id : null,
    eventTimestamp: typeof obj.event_timestamp === 'number' ? obj.event_timestamp : Date.parse(line.timestamp),
    timestamp: line.timestamp,
    isError: Boolean(body.isError),
    log: typeof body.log === 'string' ? body.log : null,
    requestBody: typeof body.requestBody === 'string' ? body.requestBody : null,
    responseBody: typeof body.responseBody === 'string' ? body.responseBody : null,
    full: obj,
  };
}

export function groupIntoToolCalls(lines: GatewayRawLine[]): ToolCall[] {
  // Group parsed lines by trace_id, preserving arrival order within a trace.
  const groups = new Map<string, ParsedLine[]>();
  for (const raw of lines) {
    const p = parseLine(raw);
    if (!p || !p.traceId) continue;
    const arr = groups.get(p.traceId);
    if (arr) arr.push(p);
    else groups.set(p.traceId, [p]);
  }

  const calls: ToolCall[] = [];
  for (const [traceId, group] of groups) {
    group.sort((a, b) => a.eventTimestamp - b.eventTimestamp);
    const requestBody = group.find((l) => l.requestBody)?.requestBody ?? null;
    const responseBody = group.find((l) => l.responseBody)?.responseBody ?? null;
    const gatewayErrorLine = group.find((l) => l.isError);

    const method = requestBody ? ((parseJavaMap(requestBody).method as string | undefined) ?? null) : null;
    const isListing = method === 'tools/list';
    const toolFull = requestBody && !isListing ? extractToolName(requestBody) : null;
    const tool = toolFull ? (extractEngine(toolFull) ?? toolFull) : null;
    const args = requestBody ? extractArguments(requestBody) : {};
    const query = typeof args.query === 'string' ? args.query : null;

    const toolError = responseBody ? extractToolError(responseBody) : null;
    let status: ToolCallStatus = 'success';
    let errorMessage: string | null = null;
    if (gatewayErrorLine) {
      status = 'gateway-error';
      errorMessage = gatewayErrorLine.log;
    } else if (toolError) {
      status = 'tool-error';
      errorMessage = toolError;
    }

    const response = responseBody ? extractResponseText(responseBody) : null;
    const embeddedLatency = responseBody ? extractLatencyMs(responseBody) : null;
    const computedLatency =
      group.length > 1 ? group[group.length - 1].eventTimestamp - group[0].eventTimestamp : null;
    const latencyMs = embeddedLatency ?? computedLatency;

    calls.push({
      traceId,
      spanId: group[0].spanId,
      timestamp: group[0].timestamp,
      tool,
      toolFull,
      method,
      isListing,
      args,
      query,
      status,
      errorMessage,
      response,
      latencyMs,
      raw: group.map((l) => l.full),
    });
  }

  // Newest first.
  calls.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return calls;
}
