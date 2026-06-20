import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listInferenceModels, chatCompletion, inferenceBase } from './inference';

// Mock the auth module
vi.mock('@/lib/server/auth', () => ({
  getGatewayToken: vi.fn(() => Promise.resolve('mock-token')),
}));

// Mock global fetch
global.fetch = vi.fn();

describe('inferenceBase', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
  });

  it('throws when NEXT_PUBLIC_GATEWAY_URL is not set', () => {
    expect(() => inferenceBase()).toThrow('NEXT_PUBLIC_GATEWAY_URL is not configured');
  });

  it('replaces /mcp with /inference in the gateway URL', () => {
    process.env.NEXT_PUBLIC_GATEWAY_URL = 'https://gateway.example.com/mcp';
    expect(inferenceBase()).toBe('https://gateway.example.com/inference');
  });

  it('handles URLs without /mcp suffix by appending /inference', () => {
    process.env.NEXT_PUBLIC_GATEWAY_URL = 'https://gateway.example.com';
    expect(inferenceBase()).toBe('https://gateway.example.com/inference');
  });
});

describe('listInferenceModels', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GATEWAY_URL = 'https://gateway.example.com/mcp';
    vi.clearAllMocks();
  });

  it('fetches models from /v1/models and parses the response', async () => {
    const mockResponse = {
      object: 'list',
      data: [
        { id: 'bedrock-mantle/anthropic.claude-3-sonnet', object: 'model', created: 1234567890, owned_by: 'bedrock' },
        { id: 'anthropic-inference/claude-3-haiku', object: 'model', created: 1234567890, owned_by: 'anthropic' },
      ],
    };

    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const models = await listInferenceModels();

    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      id: 'bedrock-mantle/anthropic.claude-3-sonnet',
      target: 'bedrock-mantle',
      modelId: 'anthropic.claude-3-sonnet',
      ownedBy: 'bedrock',
    });
    expect(models[1]).toEqual({
      id: 'anthropic-inference/claude-3-haiku',
      target: 'anthropic-inference',
      modelId: 'claude-3-haiku',
      ownedBy: 'anthropic',
    });

    expect(global.fetch).toHaveBeenCalledWith('https://gateway.example.com/inference/v1/models', expect.any(Object));
  });

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Gateway error' }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(listInferenceModels()).rejects.toThrow(/Gateway HTTP 502/);
  });
});

describe('chatCompletion', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GATEWAY_URL = 'https://gateway.example.com/mcp';
    vi.clearAllMocks();
  });

  it('routes bedrock-mantle models to /v1/messages with anthropic_version header and body field', async () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'Hello world' }],
      model: 'bedrock-mantle/anthropic.claude-3-sonnet',
      usage: { input_tokens: 10, output_tokens: 20 },
    };

    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await chatCompletion('bedrock-mantle/anthropic.claude-3-sonnet', 'Say hello', 100);

    expect(result).toEqual({
      content: 'Hello world',
      model: 'bedrock-mantle/anthropic.claude-3-sonnet',
      usage: { input_tokens: 10, output_tokens: 20 },
      via: 'messages',
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[0]).toContain('/v1/messages');
    expect(callArgs[1].headers).toEqual(expect.objectContaining({ 'anthropic-version': '2023-06-01' }));

    const body = JSON.parse(callArgs[1].body);
    expect(body).toEqual(
      expect.objectContaining({
        model: 'bedrock-mantle/anthropic.claude-3-sonnet',
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    );
  });

  it('routes anthropic-inference models to /v1/chat/completions', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello from anthropic' } }],
      model: 'anthropic-inference/claude-3-haiku',
      usage: { prompt_tokens: 10, completion_tokens: 15 },
    };

    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await chatCompletion('anthropic-inference/claude-3-haiku', 'Say hello', 50);

    expect(result).toEqual({
      content: 'Hello from anthropic',
      model: 'anthropic-inference/claude-3-haiku',
      usage: { prompt_tokens: 10, completion_tokens: 15 },
      via: 'chat',
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[0]).toContain('/v1/chat/completions');
    expect(callArgs[1].headers).not.toHaveProperty('anthropic-version');

    const body = JSON.parse(callArgs[1].body);
    expect(body).toEqual(
      expect.objectContaining({
        model: 'anthropic-inference/claude-3-haiku',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    );
  });

  it('throws on gateway error', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Model not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(chatCompletion('invalid-model', 'hello')).rejects.toThrow(/Gateway HTTP 404/);
  });
});
