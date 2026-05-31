import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callTool, unwrapToolText } from '@/lib/server/mcp';

export const dynamic = 'force-dynamic';

const CallRequestSchema = z.object({
  tool_name: z.string().min(1),
  input: z.record(z.string(), z.any()).default({}),
});

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof CallRequestSchema>;
  try {
    parsed = CallRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body', details: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  try {
    const result = await callTool(parsed.tool_name, parsed.input);
    return NextResponse.json({
      isError: result.isError,
      content: result.content,
      // Convenience: the parsed JSON payload our tools embed as text.
      data: unwrapToolText(result),
    });
  } catch (error) {
    console.error('Failed to call tool:', error);
    return NextResponse.json(
      { error: 'Failed to call tool', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
