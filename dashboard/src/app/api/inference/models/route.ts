import { NextResponse } from 'next/server';
import { listInferenceModels } from '@/lib/server/inference';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const models = await listInferenceModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('Failed to list inference models:', error);
    return NextResponse.json(
      { error: 'Failed to list inference models', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
