import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { NetworkConstruct } from './network/index.js';
import { KmsConstruct } from './security/kms.js';
import { ConfigTableConstruct } from './data/config-table.js';
import { QuotaTableConstruct } from './data/quota-table.js';
import { SearchRouterFn } from './compute/search-router-fn.js';

export class SearchGatewayStack extends Stack {
  readonly searchRouter: SearchRouterFn;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const network = new NetworkConstruct(this, 'Network');
    const kms = new KmsConstruct(this, 'Kms');
    const configTable = new ConfigTableConstruct(this, 'Config', { kmsKey: kms.ddbKey });
    const quotaTable = new QuotaTableConstruct(this, 'Quota', { kmsKey: kms.ddbKey });

    this.searchRouter = new SearchRouterFn(this, 'SearchRouter', {
      vpc: network.vpc as IVpc,
      quotaTable: quotaTable.table as ITable,
      quotaLimits: { arxiv: { rpm: 30, daily: 1000 } }
    });
  }
}
