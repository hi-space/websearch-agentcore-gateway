# Websearch Gateway Dashboard

Unified dashboard for managing and monitoring the websearch tool gateway with multi-engine search capabilities.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS 4** with shadcn/ui components
- **AWS SDK** for CloudWatch, Cognito, Bedrock AgentCore
- **Recharts** for metrics visualization
- **SWR** for data fetching
- **Zod** for schema validation
- **Sonner** for toast notifications

## Features

### Pages

- **Home** — Dashboard navigation hub
- **Inspector** (`/inspector`) — MCP tool testing and inspection
- **Observability** (`/observability`) — CloudWatch metrics (invocations, latency, errors)
- **Access** (`/access`) — AgentCore gateway access control (JWT authorizer, allowed clients, targets)
- **Playground** (`/playground`) — Multi-engine search comparison
- **Audit** (`/audit`) — CloudWatch Logs Insights query

### Components

- Minimal shadcn/ui components: Button, Input, Label, Card, Textarea
- Radix UI primitives for accessibility
- Lucide icons throughout

## Setup

### Prerequisites

- Node.js 18+ and pnpm
- AWS credentials configured (for CloudWatch/Cognito access)
- Terraform outputs from the gateway infrastructure

### Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill in the values from your Terraform outputs:

```env
NEXT_PUBLIC_REGION=ap-northeast-2
NEXT_PUBLIC_GATEWAY_ID=<gateway-id>
NEXT_PUBLIC_GATEWAY_URL=https://<gateway-endpoint>
NEXT_PUBLIC_COGNITO_DOMAIN=https://<domain>.auth.ap-northeast-2.amazoncognito.com
NEXT_PUBLIC_COGNITO_CLIENT_ID=<client-id>
```

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Visit `http://localhost:3000`

### Build

```bash
pnpm build
pnpm start
```

## API Routes

All AWS SDK calls are server-side only:

- `/api/mcp/list` — List available tools
- `/api/mcp/call` — Execute a tool
- `/api/mcp/parallel-search` — Fan-out search across all engines
- `/api/cw/metrics` — Get CloudWatch metrics (time-ranged)
- `/api/cw/logs` — Query CloudWatch Logs Insights
- `/api/access` — Gateway access overview (authorizer, allowed clients, targets)
- `/api/auth/login` — Cognito authentication (ROPC + M2M)

## Structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page
│   ├── inspector/           # MCP tool inspector
│   ├── observability/       # CloudWatch metrics
│   ├── access/              # Gateway access control
│   ├── playground/          # Multi-engine search
│   ├── audit/               # Logs Insights
│   └── api/
│       ├── mcp/             # MCP routes
│       ├── cw/              # CloudWatch routes
│       ├── access/          # Gateway access route
│       └── auth/            # Auth routes
├── components/
│   └── ui/                  # shadcn/ui primitives
├── lib/
│   ├── utils.ts            # Utility functions (cn)
│   ├── constants.ts        # Environment constants
│   ├── aws.ts              # AWS type definitions
│   ├── mcp-client.ts       # MCP HTTP client
│   └── eval.ts             # Search result evaluation
└── globals.css             # Tailwind configuration
```

## Development Notes

### Cognito Integration

- ROPC flow: Username + password authentication
- M2M flow: Client credentials for service-to-service
- Token stored in httpOnly cookies (via API routes)

### CloudWatch Metrics

Time ranges: 1h, 6h, 24h, 7d

Metric namespaces:
- `AWS/Bedrock-AgentCore` for gateway metrics
- `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/<gateway-id>` for logs

### Search Engines

Enabled engines: serper, exa, duckduckgo, perplexity, tavily, brave

Parallel search:
- Fan-out requests to all enabled engines
- Aggregate results with metadata (latency, dedup score)
- JSON export support

## Local-Only Deployment

This dashboard is designed for local development and testing:

- No Docker/containerization
- No CloudFront or CDN
- Direct AWS SDK credentials (requires AWS CLI configuration)
- Single-region support

## Troubleshooting

### Gateway Connection Issues

- Verify `NEXT_PUBLIC_GATEWAY_URL` is accessible from your network
- Check AWS credentials and IAM permissions
- Ensure security groups allow traffic to the gateway

### CloudWatch Access Denied

- Verify IAM role has `cloudwatch:GetMetricStatistics` and `logs:*` permissions
- Check AWS region configuration

### Cognito Token Errors

- Verify Cognito User Pool ID and Client ID
- Check auth flow is supported (ROPC vs PKCE)
- Ensure client secret is configured if required
