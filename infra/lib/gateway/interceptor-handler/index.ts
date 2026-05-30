/**
 * Gateway Request Interceptor — runs between JWT validation and target Lambda.
 *
 * AgentCore Gateway does not propagate JWT claims to the target Lambda's
 * `clientContext`. Per AWS multi-tenant reference architecture, the supported
 * way to push caller identity into a target is to register a Request
 * Interceptor that mutates `gatewayRequest.body` before the call is forwarded.
 *
 * Contract (per AgentCore docs):
 *   event.mcp.gatewayRequest.headers   — original request headers (we read auth)
 *   event.mcp.gatewayRequest.body      — JSON-encoded tool arguments (we mutate)
 * Returned object replaces gatewayRequest in flight.
 *
 * We extract the JWT `sub` claim and inject it as `__principal` in the tool
 * arguments. The search-router handler reads `__principal` and uses it as the
 * quota partition key. M2M tokens (no user) get the literal `service`.
 */

interface GatewayInterceptorEvent {
  mcp?: {
    gatewayRequest?: {
      headers?: Record<string, string>;
      body?: string | Record<string, unknown>;
    };
  };
}

interface GatewayInterceptorResponse {
  mcp: {
    gatewayRequest: {
      headers?: Record<string, string>;
      body: string;
    };
  };
}

const SERVICE_PRINCIPAL = 'service';

export const handler = async (event: GatewayInterceptorEvent): Promise<GatewayInterceptorResponse> => {
  const gatewayRequest = event.mcp?.gatewayRequest ?? {};
  const headers = gatewayRequest.headers ?? {};
  const body = parseBody(gatewayRequest.body);

  const principal = extractPrincipal(headers);
  const mutatedBody = injectPrincipal(body, principal);

  return {
    mcp: {
      gatewayRequest: {
        headers,
        body: JSON.stringify(mutatedBody)
      }
    }
  };
};

function parseBody(raw: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw;
}

function extractPrincipal(headers: Record<string, string>): string {
  const auth = headers.authorization ?? headers.Authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return SERVICE_PRINCIPAL;

  const parts = match[1]!.split('.');
  if (parts.length !== 3) return SERVICE_PRINCIPAL;

  try {
    const payloadJson = Buffer.from(toBase64(parts[1]!), 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson) as { sub?: string; token_use?: string };
    if (payload.sub && typeof payload.sub === 'string') return payload.sub;
    return SERVICE_PRINCIPAL;
  } catch {
    return SERVICE_PRINCIPAL;
  }
}

function toBase64(b64url: string): string {
  const padded = b64url.padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');
  return padded.replace(/-/g, '+').replace(/_/g, '/');
}

function injectPrincipal(body: Record<string, unknown>, principal: string): Record<string, unknown> {
  const current = body['arguments'];
  if (current && typeof current === 'object') {
    return { ...body, arguments: { ...(current as Record<string, unknown>), __principal: principal } };
  }
  return { ...body, __principal: principal };
}
