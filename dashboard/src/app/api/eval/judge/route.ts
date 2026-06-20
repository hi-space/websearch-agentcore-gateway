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

// EvaluateCommand는 호출당 결과를 최대 10개만 돌려준다(라이브 검증: 11개 span을
// 보내면 1개가 조용히 누락됨). 엔진 수가 이 한도를 넘으면 배치로 나눠 호출한다.
const MAX_SPANS_PER_CALL = 10;

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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 한 축(evaluator) 채점. id 미설정이거나 호출 실패 시 null 반환(부분 실패 graceful).
// 엔진(=span) 수가 10개를 넘으면 10개씩 배치로 나눠 호출하고 결과를 병합한다 —
// 안 그러면 evaluate가 10개만 돌려줘 초과 엔진이 조용히 "평가 안 됨"이 된다.
async function judgeAxis(
  evaluatorId: string,
  sessionSpans: unknown[],
  engineByTraceId: Record<string, string>,
): Promise<Record<string, AxisScore> | null> {
  if (!evaluatorId) return null;
  try {
    const batches = chunk(sessionSpans, MAX_SPANS_PER_CALL);
    const merged: Record<string, AxisScore> = {};
    const responses = await Promise.all(
      batches.map((batch) =>
        client.send(
          new EvaluateCommand({
            evaluatorId,
            evaluationInput: { sessionSpans: batch as never },
          }),
        ),
      ),
    );
    for (const res of responses) {
      Object.assign(merged, mapResultsByEngine(res.evaluationResults ?? [], engineByTraceId));
    }
    // 부분 실패(errorCode) 엔진은 점수 없이 사유만 남으므로 서버 로그로 남겨 추적 가능하게 한다.
    for (const [engine, score] of Object.entries(merged)) {
      if (score.error) console.warn(`evaluate ${evaluatorId} partial failure for ${engine}: ${score.error}`);
    }
    // 보낸 엔진 중 응답에 전혀 없는 엔진(누락)도 로그로 경고한다.
    const missing = Object.values(engineByTraceId).filter((e) => !(e in merged));
    if (missing.length) console.warn(`evaluate ${evaluatorId} returned no result for: ${missing.join(', ')}`);
    return merged;
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
