import { engineFromToolName } from '@/lib/engines';

// ESTIMATES ONLY — cost per 1,000 tool calls, in USD. The gateway emits no
// token/cost metric (docs/03-observability.md §1.5), so the cost card multiplies
// CloudWatch Invocations by these published-list approximations. Treat as
// directional, not billing-accurate; verify against Bedrock Usage / Cost Explorer.
export const ENGINE_UNIT_COST_USD: Record<string, number> = {
  serper: 0.3,
  exa: 5.0,
  perplexity: 5.0,
  brave: 3.0,
  tavily: 8.0,
  tavily_lambda: 8.0,
  firecrawl: 2.0,
  you: 4.0,
  anthropic: 10.0, // includes model cost for the built-in web_search answer
  duckduckgo: 0.0, // keyless
  searxng: 0.0, // self-hosted
  agentcore: 0.0, // managed Web Search connector — no per-call API key cost
};

export const DEFAULT_UNIT_COST_USD = 1.0;

export interface CostRow {
  name: string;
  engine: string;
  invocations: number;
  estUsd: number;
}

export function estimateCost(
  toolStats: Array<{ name: string; invocations: number }>,
): { perTool: CostRow[]; totalUsd: number } {
  const perTool: CostRow[] = toolStats.map((t) => {
    const engine = engineFromToolName(t.name) ?? t.name;
    const rate = engine in ENGINE_UNIT_COST_USD ? ENGINE_UNIT_COST_USD[engine] : DEFAULT_UNIT_COST_USD;
    return { name: t.name, engine, invocations: t.invocations, estUsd: (t.invocations / 1000) * rate };
  });
  const totalUsd = perTool.reduce((a, r) => a + r.estUsd, 0);
  return { perTool, totalUsd };
}
