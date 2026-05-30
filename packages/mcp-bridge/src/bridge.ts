import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { TokenManager } from './auth/manager.js';
import { createAuthorizedFetch } from './http.js';

export interface BridgeConfig {
  gatewayUrl: string;
  manager: TokenManager;
  /** stdio transport name advertised to Claude Desktop. */
  serverName?: string;
  serverVersion?: string;
}

/**
 * Wires a stdio MCP server (talking to Claude Desktop) to a streamable-HTTP
 * MCP client (talking to AgentCore Gateway). The bridge forwards tool/list
 * and tool/call verbatim, with the auth layer attaching/refreshing Cognito
 * Bearer tokens transparently.
 *
 * AgentCore Gateway exposes only tools — no resources or prompts — so the
 * resource/prompt list handlers always return empty. We still register them
 * so Claude Desktop's MCP discovery doesn't error out.
 */
export async function startBridge(cfg: BridgeConfig): Promise<void> {
  const upstream = await connectUpstream(cfg);

  const server = new Server(
    { name: cfg.serverName ?? 'search-gateway', version: cfg.serverVersion ?? '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => upstream.listTools());
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    upstream.callTool({ name: req.params.name, arguments: req.params.arguments })
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[mcp-bridge] stdio MCP server ready\n');
}

async function connectUpstream(cfg: BridgeConfig): Promise<Client> {
  const authorizedFetch = createAuthorizedFetch({ manager: cfg.manager });
  const transport = new StreamableHTTPClientTransport(new URL(cfg.gatewayUrl), {
    fetch: authorizedFetch
  });
  const client = new Client(
    { name: 'search-gateway-bridge', version: '0.1.0' },
    { capabilities: {} }
  );
  // The SDK's StreamableHTTPClientTransport carries `sessionId?: string` while
  // the Transport interface declares it required, which trips
  // exactOptionalPropertyTypes. The runtime contract is correct; this
  // assertion is the documented narrowing.
  await client.connect(transport as unknown as Parameters<Client['connect']>[0]);
  return client;
}
