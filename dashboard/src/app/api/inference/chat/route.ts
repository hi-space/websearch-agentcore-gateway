import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chatCompletion } from '@/lib/server/inference';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  maxTokens: z.number().optional(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body', details: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  try {
    const result = await chatCompletion(body.model, body.prompt, body.maxTokens);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to call inference chat:', error);
    return NextResponse.json(
      { error: 'Failed to call inference chat', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
