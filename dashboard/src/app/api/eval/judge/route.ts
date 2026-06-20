import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BedrockAgentCoreClient, EvaluateCommand } from '@aws-sdk/client-bedrock-agentcore';
import { AWS_REGION } from '@/lib/constants';
import { buildSessionSpans, mapScoresByEngine } from '@/lib/judge-spans';

export const dynamic = 'force-dynamic';

// 선택적 배포: UI 노출은 NEXT_PUBLIC_JUDGE_ENABLED, 평가자는 JUDGE_EVALUATOR_ID로 제어.
const JUDGE_ENABLED = process.env.NEXT_PUBLIC_JUDGE_ENABLED === '1';
const EVALUATOR_ID = process.env.JUDGE_EVALUATOR_ID || 'Builtin.Helpfulness';

const client = new BedrockAgentCoreClient({ region: AWS_REGION });

const BodySchema = z.object({
  query: z.string().min(1),
  engines: z.record(
    z.string(),
    z.array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        snippet: z.string().optional(),
      }),
    ),
  ),
});

export async function POST(request: NextRequest) {
  if (!JUDGE_ENABLED) {
    return NextResponse.json({ error: 'Judge is not enabled' }, { status: 501 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body', details: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  const { sessionSpans, engineByTraceId } = buildSessionSpans(body.query, body.engines);

  try {
    const res = await client.send(
      new EvaluateCommand({
        evaluatorId: EVALUATOR_ID,
        // sessionSpans는 document(자유 JSON) 타입. SDK 타입상 캐스팅이 필요할 수 있다.
        evaluationInput: { sessionSpans: sessionSpans as never },
      }),
    );
    const scores = mapScoresByEngine(res.evaluationResults ?? [], engineByTraceId);
    if ((res.evaluationResults?.length ?? 0) > 0 && Object.keys(scores).length === 0) {
      console.warn('AgentCore evaluate returned results but none mapped to a known engine spanId', {
        resultCount: res.evaluationResults?.length,
      });
    }
    return NextResponse.json({ scores });
  } catch (error) {
    console.error('AgentCore evaluate failed:', error);
    return NextResponse.json(
      { error: 'Evaluation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
