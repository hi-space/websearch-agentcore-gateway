import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BedrockAgentCoreClient, EvaluateCommand } from '@aws-sdk/client-bedrock-agentcore';
import { AWS_REGION } from '@/lib/constants';
import { buildSessionSpans, mapResultsByEngine, type AxisScore } from '@/lib/judge-spans';

export const dynamic = 'force-dynamic';

// 선택적 배포: UI 노출은 NEXT_PUBLIC_JUDGE_ENABLED, 평가자는 축별 env로 제어.
const JUDGE_ENABLED = process.env.NEXT_PUBLIC_JUDGE_ENABLED === '1';
const RELEVANCE_EVALUATOR_ID = process.env.JUDGE_RELEVANCE_EVALUATOR_ID || '';
const AUTHORITY_EVALUATOR_ID = process.env.JUDGE_AUTHORITY_EVALUATOR_ID || '';

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

// 한 축(evaluator) 채점. id 미설정이거나 호출 실패 시 null 반환(부분 실패 graceful).
async function judgeAxis(
  evaluatorId: string,
  sessionSpans: unknown[],
  engineByTraceId: Record<string, string>,
): Promise<Record<string, AxisScore> | null> {
  if (!evaluatorId) return null;
  try {
    const res = await client.send(
      new EvaluateCommand({
        evaluatorId,
        evaluationInput: { sessionSpans: sessionSpans as never },
      }),
    );
    return mapResultsByEngine(res.evaluationResults ?? [], engineByTraceId);
  } catch (error) {
    console.error(`AgentCore evaluate failed for ${evaluatorId}:`, error);
    return null;
  }
}

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

  if (!RELEVANCE_EVALUATOR_ID && !AUTHORITY_EVALUATOR_ID) {
    return NextResponse.json(
      { error: 'No evaluators configured (set JUDGE_RELEVANCE_EVALUATOR_ID / JUDGE_AUTHORITY_EVALUATOR_ID)' },
      { status: 501 },
    );
  }

  const { sessionSpans, engineByTraceId } = buildSessionSpans(body.query, body.engines);

  const [relevance, authority] = await Promise.all([
    judgeAxis(RELEVANCE_EVALUATOR_ID, sessionSpans, engineByTraceId),
    judgeAxis(AUTHORITY_EVALUATOR_ID, sessionSpans, engineByTraceId),
  ]);

  return NextResponse.json({ relevance, authority });
}
