import { describe, it, expect } from 'vitest';
import {
  parseJavaMap,
  extractToolName,
  extractEngine,
  extractArguments,
  extractToolError,
  extractLatencyMs,
  extractResponseText,
  prettyPrintBody,
  groupIntoToolCalls,
  type GatewayRawLine,
} from './audit-logs';

describe('parseJavaMap', () => {
  it('parses a flat map of key=value pairs', () => {
    expect(parseJavaMap('{id=3, jsonrpc=2.0, method=tools/call}')).toEqual({
      id: '3',
      jsonrpc: '2.0',
      method: 'tools/call',
    });
  });

  it('parses nested maps', () => {
    expect(
      parseJavaMap('{method=tools/call, params={name=serper___web_search, arguments={num_results=2, query=test}}}')
    ).toEqual({
      method: 'tools/call',
      params: {
        name: 'serper___web_search',
        arguments: { num_results: '2', query: 'test' },
      },
    });
  });

  it('keeps a value containing commas inside a quoted-ish segment intact', () => {
    // arguments values can themselves contain commas; we split on top-level commas only.
    expect(parseJavaMap('{query=claude, opus, release}')).toEqual({
      query: 'claude, opus, release',
    });
  });

  it('returns empty object for non-map input', () => {
    expect(parseJavaMap('not a map')).toEqual({});
    expect(parseJavaMap('')).toEqual({});
  });
});

describe('extractToolName / extractEngine', () => {
  const reqBody = '{id=3, jsonrpc=2.0, method=tools/call, params={name=serper___web_search, arguments={num_results=2, query=test}}}';

  it('extracts the full tool name from a tools/call requestBody', () => {
    expect(extractToolName(reqBody)).toBe('serper___web_search');
  });

  it('extracts the engine (the part before ___)', () => {
    expect(extractEngine('serper___web_search')).toBe('serper');
    expect(extractEngine('tavily___tavily_search')).toBe('tavily');
  });

  it('returns null engine when no ___ present', () => {
    expect(extractEngine('x_amz_bedrock_agentcore_search')).toBe(null);
  });

  it('returns null tool name for tools/list', () => {
    expect(extractToolName('{id=1, jsonrpc=2.0, method=tools/list, params={}}')).toBe(null);
  });
});

describe('extractArguments', () => {
  it('returns the arguments object from a tools/call requestBody', () => {
    const reqBody = '{id=3, method=tools/call, params={name=serper___web_search, arguments={num_results=2, query=test}}}';
    expect(extractArguments(reqBody)).toEqual({ num_results: '2', query: 'test' });
  });

  it('returns empty object when no arguments', () => {
    expect(extractArguments('{id=1, method=tools/list, params={}}')).toEqual({});
  });
});

describe('extractToolError / extractLatencyMs', () => {
  const respBody =
    '{jsonrpc=2.0, id=3, result={isError=false, content=[{type=text, text={"results":[],"engine":"serper","latency_ms":631,"error":"Serper API error: 403 Client Error: Forbidden for url: https://google.serper.dev/search"}}]}}';

  it('extracts an embedded tool-level error string from responseBody', () => {
    expect(extractToolError(respBody)).toBe(
      'Serper API error: 403 Client Error: Forbidden for url: https://google.serper.dev/search'
    );
  });

  it('returns null when the embedded error is null or absent', () => {
    expect(extractToolError('{result={content=[{text={"results":[],"error":null}}]}}')).toBe(null);
    expect(extractToolError('{result={content=[{text={"results":[]}}]}}')).toBe(null);
  });

  it('unescapes quotes in error strings', () => {
    const respBody = '{text={"error":"Expected \\"param\\""}}';
    expect(extractToolError(respBody)).toBe('Expected "param"');
  });

  it('extracts latency_ms from the embedded result JSON', () => {
    expect(extractLatencyMs(respBody)).toBe(631);
    expect(extractLatencyMs('{result={content=[]}}')).toBe(null);
  });
});

describe('extractResponseText', () => {
  it('extracts the balance-matched text= JSON payload from a responseBody', () => {
    const respBody =
      '{jsonrpc=2.0, id=5, result={isError=false, content=[{type=text, text={"results":[{"title":"x"}],"engine":"duckduckgo","latency_ms":450}}]}}';
    expect(extractResponseText(respBody)).toBe(
      '{"results":[{"title":"x"}],"engine":"duckduckgo","latency_ms":450}'
    );
  });

  it('returns null when there is no text= payload', () => {
    expect(extractResponseText('{jsonrpc=2.0, id=1, result={tools=[]}}')).toBe(null);
  });
});

describe('prettyPrintBody', () => {
  it('indents a flat Java-map body onto multiple lines', () => {
    expect(prettyPrintBody('{id=3, jsonrpc=2.0, method=tools/call}')).toBe(
      ['{', '  id=3,', '  jsonrpc=2.0,', '  method=tools/call', '}'].join('\n')
    );
  });

  it('nests deeper for nested maps', () => {
    expect(prettyPrintBody('{method=tools/call, params={name=serper, arguments={query=test}}}')).toBe(
      [
        '{',
        '  method=tools/call,',
        '  params={',
        '    name=serper,',
        '    arguments={',
        '      query=test',
        '    }',
        '  }',
        '}',
      ].join('\n')
    );
  });

  it('does not break on commas or braces inside quoted strings', () => {
    // The embedded JSON value contains commas and a URL with no spaces; the
    // quoted "error" string must stay on one line.
    const body = '{result={text={"engine":"serper","error":"403, Forbidden: https://x/y"}}}';
    const out = prettyPrintBody(body);
    expect(out).toContain('"error":"403, Forbidden: https://x/y"');
    // The quoted comma did not spawn a new line.
    expect(out).not.toContain('Forbidden:\n');
  });

  it('handles escaped quotes inside strings', () => {
    const out = prettyPrintBody('{text={"error":"Expected \\"param\\""}}');
    expect(out).toContain('"error":"Expected \\"param\\""');
  });

  it('formats arrays with one element per line', () => {
    const out = prettyPrintBody('{content=[{type=text}, {type=image}]}');
    expect(out).toBe(
      [
        '{',
        '  content=[',
        '    {',
        '      type=text',
        '    },',
        '    {',
        '      type=image',
        '    }',
        '  ]',
        '}',
      ].join('\n')
    );
  });

  it('returns the original for empty input', () => {
    expect(prettyPrintBody('')).toBe('');
  });
});

// Each raw line mirrors the shape /api/cw/logs hands us: a flat object with
// message (the full JSON string) and timestamp.
function line(obj: Record<string, unknown>, tsMs: number): GatewayRawLine {
  return { message: JSON.stringify(obj), timestamp: new Date(tsMs).toISOString() };
}

describe('groupIntoToolCalls', () => {
  it('groups a serper tool-error trace into one tool-error ToolCall', () => {
    const trace = '6a1bb5ce0660eda90c52c05330094654';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 's1',
          event_timestamp: 1000,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody:
              '{id=3, jsonrpc=2.0, method=tools/call, params={name=serper___web_search, arguments={num_results=2, query=test}}}',
          },
        },
        1000
      ),
      line(
        {
          trace_id: trace,
          span_id: 's1',
          event_timestamp: 1100,
          body: { isError: false, log: 'Executing tool serper___web_search from target YRCUTGDLLJ' },
        },
        1100
      ),
      line(
        {
          trace_id: trace,
          span_id: 's1',
          event_timestamp: 1631,
          body: {
            isError: false,
            log: 'Successfully processed request',
            responseBody:
              '{jsonrpc=2.0, id=3, result={isError=false, content=[{type=text, text={"results":[],"engine":"serper","latency_ms":631,"error":"Serper API error: 403 Forbidden"}}]}}',
          },
        },
        1631
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.tool).toBe('serper');
    expect(c.toolFull).toBe('serper___web_search');
    expect(c.status).toBe('tool-error');
    expect(c.query).toBe('test');
    expect(c.errorMessage).toBe('Serper API error: 403 Forbidden');
    expect(c.latencyMs).toBe(631);
    expect(c.traceId).toBe(trace);
    expect(c.isListing).toBe(false);
  });

  it('classifies an isError=true trace as gateway-error with the error log text', () => {
    const trace = '6a1bb5ce50b027801fcb6f6a3f0bffbb';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 's2',
          event_timestamp: 2000,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody:
              '{id=2, jsonrpc=2.0, method=tools/call, params={name=tavily___tavily_search, arguments={query=anthropic claude opus}}}',
          },
        },
        2000
      ),
      line(
        {
          trace_id: trace,
          span_id: 's2',
          event_timestamp: 2300,
          body: {
            isError: true,
            log: 'Failed to fetch outbound api key. Access denied when retrieving secret arn:...:tavily-520b17bc',
          },
        },
        2300
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('tavily');
    expect(calls[0].status).toBe('gateway-error');
    expect(calls[0].errorMessage).toContain('Access denied');
    // No embedded latency → computed from first/last timestamp (~300ms).
    expect(calls[0].latencyMs).toBe(300);
  });

  it('classifies a successful trace as success', () => {
    const trace = 'aaaa';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 's3',
          event_timestamp: 3000,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody:
              '{id=5, method=tools/call, params={name=duckduckgo___web_search, arguments={query=gateway}}}',
          },
        },
        3000
      ),
      line(
        {
          trace_id: trace,
          span_id: 's3',
          event_timestamp: 3500,
          body: {
            isError: false,
            log: 'Successfully processed request',
            responseBody:
              '{jsonrpc=2.0, id=5, result={isError=false, content=[{type=text, text={"results":[{"title":"x"}],"engine":"duckduckgo","latency_ms":450}}]}}',
          },
        },
        3500
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls[0].status).toBe('success');
    expect(calls[0].errorMessage).toBe(null);
    expect(calls[0].response).toBe('{"results":[{"title":"x"}],"engine":"duckduckgo","latency_ms":450}');
    expect(calls[0].latencyMs).toBe(450);
  });

  it('marks a tools/list trace as isListing with tool=null', () => {
    const trace = 'bbbb';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 's4',
          event_timestamp: 4000,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody: '{id=1, jsonrpc=2.0, method=tools/list, params={}}',
          },
        },
        4000
      ),
      line(
        {
          trace_id: trace,
          span_id: 's4',
          event_timestamp: 4050,
          body: {
            isError: false,
            log: 'Successfully processed request',
            responseBody: '{jsonrpc=2.0, id=1, result={tools=[]}}',
          },
        },
        4050
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls[0].isListing).toBe(true);
    expect(calls[0].tool).toBe(null);
  });

  it('sorts tool calls newest-first by timestamp', () => {
    const older = [
      line(
        {
          trace_id: 'old',
          span_id: 'o',
          event_timestamp: 1000,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody: '{method=tools/call, params={name=serper___web_search, arguments={query=a}}}',
          },
        },
        1000
      ),
    ];
    const newer = [
      line(
        {
          trace_id: 'new',
          span_id: 'n',
          event_timestamp: 9000,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody: '{method=tools/call, params={name=exa___web_search, arguments={query=b}}}',
          },
        },
        9000
      ),
    ];
    const calls = groupIntoToolCalls([...older, ...newer]);
    expect(calls.map((c) => c.traceId)).toEqual(['new', 'old']);
  });

  it('preserves raw lines and degrades to tool=null when the tool name is unparseable', () => {
    const trace = 'cccc';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 's5',
          event_timestamp: 5000,
          body: { isError: false, log: 'Started processing request', requestBody: 'garbage-not-a-map' },
        },
        5000
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls[0].tool).toBe(null);
    expect(calls[0].isListing).toBe(false);
    expect(calls[0].raw).toHaveLength(1);
  });

  it('handles a trace with only a response line (no request) as success with null tool', () => {
    const trace = 'resp-only';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 'r1',
          event_timestamp: 7000,
          body: {
            isError: false,
            log: 'Successfully processed request',
            responseBody:
              '{jsonrpc=2.0, id=9, result={isError=false, content=[{type=text, text={"results":[]}}]}}',
          },
        },
        7000
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe(null);
    expect(calls[0].toolFull).toBe(null);
    expect(calls[0].method).toBe(null);
    expect(calls[0].query).toBe(null);
    expect(calls[0].status).toBe('success');
  });

  it('uses the first requestBody when a trace has multiple request lines', () => {
    const trace = 'multi-req';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 'm1',
          event_timestamp: 8000,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody:
              '{id=1, method=tools/call, params={name=serper___web_search, arguments={query=first}}}',
          },
        },
        8000
      ),
      line(
        {
          trace_id: trace,
          span_id: 'm1',
          event_timestamp: 8100,
          body: {
            isError: false,
            log: 'Started processing request',
            requestBody:
              '{id=2, method=tools/call, params={name=exa___web_search, arguments={query=second}}}',
          },
        },
        8100
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('serper');
    expect(calls[0].query).toBe('first');
  });
});

describe('caller identity join', () => {
  it('attaches callerSub/callerClientId from the identity log line', () => {
    const trace = 'abc123';
    const lines = [
      line(
        {
          trace_id: trace,
          span_id: 's1',
          event_timestamp: 1000,
          body: { requestBody: '{method=tools/call, params={name=serper___web_search, arguments={query=x}}}' },
        },
        1000
      ),
      line(
        {
          trace_id: trace,
          event_timestamp: 1100,
          body: { log: '{"event": "caller_identity", "engine": "serper", "sub": "user-9", "client_id": "web", "raw_present": true}' },
        },
        1100
      ),
    ];
    const calls = groupIntoToolCalls(lines);
    expect(calls).toHaveLength(1);
    expect(calls[0].callerSub).toBe('user-9');
    expect(calls[0].callerClientId).toBe('web');
  });

  it('leaves caller fields null when no identity line is present', () => {
    const calls = groupIntoToolCalls([
      line(
        {
          trace_id: 't2',
          span_id: 's2',
          event_timestamp: 2000,
          body: { requestBody: '{method=tools/call, params={name=serper___web_search, arguments={query=x}}}' },
        },
        2000
      ),
    ]);
    expect(calls[0].callerSub).toBeNull();
    expect(calls[0].callerClientId).toBeNull();
  });
});
