import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ITable, Table, AttributeType, BillingMode, StreamViewType, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NetworkConstruct } from '../network/index.js';
import { KmsConstruct } from '../security/kms.js';
import { CognitoConstruct } from '../security/cognito.js';
import { ConfigTableConstruct } from '../data/config-table.js';
import { ConfigSeed } from '../data/config-seed.js';
import { QuotaTableConstruct } from '../data/quota-table.js';
import { SearchRouterFn } from '../compute/search-router-fn.js';
import { AgentCoreGateway } from '../gateway/agentcore-gateway.js';
import { AlarmsConstruct } from '../observability/alarms.js';
import { SearxngService } from '../searxng/searxng-service.js';
import { enableGuardDuty } from '../security/guardduty.js';
import { enableSecurityHub } from '../security/securityhub.js';
import { applyV1NagSuppressions } from '../nag-suppressions.js';

export interface SearchStackProps extends StackProps {
  enableSearxng?: boolean;
  enableGuardDuty?: boolean;
  enableSecurityHub?: boolean;
}

export class SearchStack extends Stack {
  readonly searchRouter: SearchRouterFn;
  readonly vpc: IVpc;
  readonly configTable: ITable;
  readonly configTableName: string;
  readonly kmsSecretsKey: IKey;
  readonly auditTable: ITable;
  readonly auditTableArn: string;
  readonly auditTableStreamArn: string;
  readonly gatewayId: string;
  readonly snsTopicArn: string;
  readonly userPoolId: string;
  readonly userPoolClientId: string;

  constructor(scope: Construct, id: string, props?: SearchStackProps) {
    super(scope, id, props);
    const network = new NetworkConstruct(this, 'Network');
    const kms = new KmsConstruct(this, 'Kms');
    const cognito = new CognitoConstruct(this, 'Cognito');
    this.userPoolId = cognito.userPool.userPoolId;
    this.userPoolClientId = cognito.client.userPoolClientId;
    const configTableConstruct = new ConfigTableConstruct(this, 'Config', { kmsKey: kms.ddbKey });
    const quotaTable = new QuotaTableConstruct(this, 'Quota', { kmsKey: kms.ddbKey });

    this.vpc = network.vpc;
    this.configTable = configTableConstruct.table as ITable;
    this.configTableName = this.configTable.tableName;
    this.kmsSecretsKey = kms.secretsKey;

    // Create AuditLogTable with DynamoDB Streams for export
    this.auditTable = new Table(this, 'AuditLogTable', {
      partitionKey: { name: 'actor', type: AttributeType.STRING },
      sortKey: { name: 'ts', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kms.ddbKey,
      stream: StreamViewType.NEW_AND_OLD_IMAGES
    });
    this.auditTableArn = this.auditTable.tableArn;
    this.auditTableStreamArn = this.auditTable.tableStreamArn ?? '';

    // Seed ConfigTable with provider configurations
    new ConfigSeed(this, 'ConfigSeed', {
      table: configTableConstruct.table as ITable,
      kmsKey: kms.ddbKey,
      providers: [
        { providerId: 'arxiv', enabled: true },
        { providerId: 'exa', enabled: false },
        { providerId: 'perplexity', enabled: false },
        { providerId: 'you', enabled: false },
        { providerId: 'tavily', enabled: false, builtin: true },
        { providerId: 'brave', enabled: false, builtin: true },
        { providerId: 'searxng', enabled: false }
      ]
    });

    this.searchRouter = new SearchRouterFn(this, 'SearchRouter', {
      vpc: network.vpc as IVpc,
      quotaTable: quotaTable.table as ITable,
      quotaLimits: { arxiv: { rpm: 30, daily: 1000 } }
    });

    // Conditionally create SearxngService if enabled
    if (props?.enableSearxng) {
      const searxng = new SearxngService(this, 'Searxng', {
        vpc: network.vpc as IVpc
      });

      // Add SearxngService endpoint to router environment
      this.searchRouter.fn.addEnvironment('SEARXNG_BASE_URL', searxng.endpoint);
    }

    // Build tool definitions
    const toolDefinitions = [
      {
        name: 'search_arxiv',
        description: 'Search arXiv for academic papers.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', minLength: 1, maxLength: 2048 } },
          required: ['query']
        }
      },
      ...(props?.enableSearxng ? [{
        name: 'search_searxng',
        description: 'Search using self-hosted SearXNG instance.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', minLength: 1, maxLength: 2048 } },
          required: ['query']
        }
      }] : [])
    ];

    const gateway = new AgentCoreGateway(this, 'Gateway', {
      routerFn: this.searchRouter.fn,
      toolDefinitions,
      cognitoDiscoveryUrl: cognito.discoveryUrl,
      cognitoClientId: cognito.client.userPoolClientId
    });
    this.gatewayId = gateway.gatewayId;
    new CfnOutput(this, 'GatewayId', { value: gateway.gatewayId });
    new CfnOutput(this, 'UserPoolId', { value: cognito.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: cognito.client.userPoolClientId });

    const alarms = new AlarmsConstruct(this, 'Alarms');
    this.snsTopicArn = alarms.topic.topicArn;

    if (props?.enableGuardDuty) {
      enableGuardDuty(this);
    }
    if (props?.enableSecurityHub) {
      enableSecurityHub(this);
    }

    applyV1NagSuppressions(this);
  }
}

// Re-export for backwards compat
export { SearchStack as SearchGatewayStack };
