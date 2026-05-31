import { NextResponse } from 'next/server';
import { listTools } from '@/lib/server/mcp';

// Always run at request time; never prerender.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tools = await listTools();
    return NextResponse.json({ tools });
  } catch (error) {
    console.error('Failed to list tools:', error);
    return NextResponse.json(
      { error: 'Failed to list tools', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
