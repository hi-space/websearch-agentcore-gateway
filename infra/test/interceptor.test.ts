import { describe, it, expect } from 'vitest';
import { handler } from '../lib/gateway/interceptor-handler/index.js';

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'RS256' }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.signature-placeholder`;
}

function base64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('Gateway request interceptor', () => {
  it('extracts the JWT sub claim and injects it as arguments.__principal', async () => {
    const jwt = makeJwt({ sub: 'user-abc-123', token_use: 'access' });
    const out = await handler({
      mcp: {
        gatewayRequest: {
          headers: { authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ name: 'search_arxiv', arguments: { query: 'q' } })
        }
      }
    });
    const body = JSON.parse(out.mcp.gatewayRequest.body) as Record<string, unknown>;
    expect(body.arguments).toMatchObject({ query: 'q', __principal: 'user-abc-123' });
  });

  it('falls through to a "service" principal when no Authorization header is present (M2M / direct invoke)', async () => {
    const out = await handler({
      mcp: {
        gatewayRequest: {
          headers: {},
          body: JSON.stringify({ name: 'search_arxiv', arguments: { query: 'q' } })
        }
      }
    });
    const body = JSON.parse(out.mcp.gatewayRequest.body) as Record<string, unknown>;
    expect(body.arguments).toMatchObject({ __principal: 'service' });
  });

  it('handles malformed JWTs without throwing — falls through to service', async () => {
    const out = await handler({
      mcp: {
        gatewayRequest: {
          headers: { authorization: 'Bearer not.a.jwt' },
          body: JSON.stringify({ name: 'search_arxiv', arguments: { query: 'q' } })
        }
      }
    });
    const body = JSON.parse(out.mcp.gatewayRequest.body) as Record<string, unknown>;
    expect(body.arguments).toMatchObject({ __principal: 'service' });
  });

  it('preserves existing tool argument fields when injecting __principal', async () => {
    const jwt = makeJwt({ sub: 'user-1' });
    const out = await handler({
      mcp: {
        gatewayRequest: {
          headers: { authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ name: 'search_arxiv', arguments: { query: 'foo', topK: 7 } })
        }
      }
    });
    const body = JSON.parse(out.mcp.gatewayRequest.body) as Record<string, unknown>;
    expect(body.arguments).toEqual({ query: 'foo', topK: 7, __principal: 'user-1' });
  });
});
