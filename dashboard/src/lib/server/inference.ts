/**
 * Server-side library for interacting with the AgentCore Gateway inference targets.
 *
 * NOTE: This module reads server-only secrets and must only be imported from
 * route handlers (the `app/api/**` tree), never from client components.
 */

import { getGatewayToken } from './auth';

export interface InferenceModel {
  id: string;
  target: string;
  modelId: string;
  ownedBy: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage: unknown;
  via: 'chat' | 'messages';
}

export function inferenceBase(): string {
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error('NEXT_PUBLIC_GATEWAY_URL is not configured');
  }
  // Replace /mcp suffix with /inference, or append /inference if no /mcp
  return gatewayUrl.replace(/\/mcp$/, '') + '/inference';
}

export async function listInferenceModels(): Promise<InferenceModel[]> {
  const token = await getGatewayToken();
  const baseUrl = inferenceBase();

  const res = await fetch(`${baseUrl}/v1/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gateway HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    object?: string;
    data?: Array<{ id: string; object: string; created: number; owned_by: string }>;
  };

  const models: InferenceModel[] = [];
  for (const item of json.data ?? []) {
    const [target, ...modelIdParts] = item.id.split('/');
    const modelId = modelIdParts.join('/');
    models.push({
      id: item.id,
      target,
      modelId,
      ownedBy: item.owned_by,
    });
  }

  return models;
}

export async function chatCompletion(
  model: string,
  prompt: string,
  maxTokens?: number,
): Promise<ChatCompletionResult> {
  const token = await getGatewayToken();
  const baseUrl = inferenceBase();

  const isBedrock = model.startsWith('bedrock-mantle/');

  if (isBedrock) {
    // Use /v1/messages API with anthropic_version
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens ?? 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gateway HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage: unknown;
    };

    const textPart = json.content.find((c) => c.type === 'text');
    const content = textPart?.text ?? '';

    return {
      content,
      model: json.model,
      usage: json.usage,
      via: 'messages',
    };
  } else {
    // Use /v1/chat/completions API
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens ?? 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gateway HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage: unknown;
    };

    const content = json.choices[0]?.message.content ?? '';

    return {
      content,
      model: json.model,
      usage: json.usage,
      via: 'chat',
    };
  }
}
