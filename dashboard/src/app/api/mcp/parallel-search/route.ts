import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listTools, callTool, unwrapToolText } from '@/lib/server/mcp';
import { engineFromToolName, filterEnginesBySelection } from '@/lib/engines';

export const dynamic = 'force-dynamic';

const SearchRequestSchema = z.object({
  query: z.string().min(1),
  num_results: z.number().int().min(1).max(20).optional().default(10),
  country: z.string().optional(),
  engines: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof SearchRequestSchema>;
  try {
    parsed = SearchRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body', details: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  const { query, num_results, country, engines } = parsed;

  let searchTools: Array<{ name: string; engine: string }>;
  try {
    const tools = await listTools();
    searchTools = tools
      .map((t) => ({ name: t.name, engine: engineFromToolName(t.name) }))
      .filter((t): t is { name: string; engine: string } => t.engine !== null);
    searchTools = filterEnginesBySelection(searchTools, engines);
  } catch (error) {
    console.error('Failed to list tools for parallel search:', error);
    return NextResponse.json(
      { error: 'Failed to list tools', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  if (searchTools.length === 0) {
    return NextResponse.json(
      { error: 'No web_search tools available on the gateway' },
      { status: 404 }
    );
  }

  const args: Record<string, unknown> = { query, num_results };
  if (country) args.country = country;

  const entries = await Promise.all(
    searchTools.map(async ({ name, engine }) => {
      const startedAt = Date.now();
      try {
        const result = await callTool(name, args);
        const data = unwrapToolText(result) as Record<string, unknown>;
        return [
          engine,
          {
            ...data,
            isError: result.isError,
            // Prefer the tool-reported latency, fall back to round-trip time.
            latency_ms: typeof data.latency_ms === 'number' ? data.latency_ms : Date.now() - startedAt,
          },
        ] as const;
      } catch (error) {
        return [engine, { error: error instanceof Error ? error.message : String(error) }] as const;
      }
    })
  );

  return NextResponse.json(Object.fromEntries(entries));
}
