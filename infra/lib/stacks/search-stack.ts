import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { NetworkConstruct } from '../network/index.js';
import { KmsConstruct } from '../security/kms.js';
import { ConfigTableConstruct } from '../data/config-table.js';
import { ConfigSeed } from '../data/config-seed.js';
import { QuotaTableConstruct } from '../data/quota-table.js';
import { SearchRouterFn } from '../compute/search-router-fn.js';
import { AgentCoreGateway } from '../gateway/agentcore-gateway.js';
import { AlarmsConstruct } from '../observability/alarms.js';
import { applyV1NagSuppressions } from '../nag-suppressions.js';

export class SearchStack extends Stack {
  readonly searchRouter: SearchRouterFn;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const network = new NetworkConstruct(this, 'Network');
    const kms = new KmsConstruct(this, 'Kms');
    const configTable = new ConfigTableConstruct(this, 'Config', { kmsKey: kms.ddbKey });
    const quotaTable = new QuotaTableConstruct(this, 'Quota', { kmsKey: kms.ddbKey });

    // Seed ConfigTable with provider configurations
    new ConfigSeed(this, 'ConfigSeed', {
      table: configTable.table as ITable,
      providers: [
        { providerId: 'arxiv', enabled: true },
        { providerId: 'exa', enabled: false },
        { providerId: 'perplexity', enabled: false },
        { providerId: 'you', enabled: false },
        { providerId: 'tavily', enabled: false, builtin: true },
        { providerId: 'brave', enabled: false, builtin: true }
      ]
    });

    this.searchRouter = new SearchRouterFn(this, 'SearchRouter', {
      vpc: network.vpc as IVpc,
      quotaTable: quotaTable.table as ITable,
      quotaLimits: { arxiv: { rpm: 30, daily: 1000 } }
    });

    const gateway = new AgentCoreGateway(this, 'Gateway', {
      routerFn: this.searchRouter.fn,
      toolDefinitions: [{
        name: 'search_arxiv',
        description: 'Search arXiv for academic papers.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', minLength: 1, maxLength: 2048 } },
          required: ['query']
        }
      }]
    });
    new CfnOutput(this, 'GatewayId', { value: gateway.gatewayId });
    new AlarmsConstruct(this, 'Alarms');

    applyV1NagSuppressions(this);
  }
}

// Re-export for backwards compat
export { SearchStack as SearchGatewayStack };
