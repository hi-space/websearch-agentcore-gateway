import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NetworkConstruct } from './network/index.js';
import { KmsConstruct } from './security/kms.js';
import { ConfigTableConstruct } from './data/config-table.js';
import { QuotaTableConstruct } from './data/quota-table.js';

export class SearchGatewayStack extends Stack {
  readonly network: NetworkConstruct;
  readonly kms: KmsConstruct;
  readonly configTable: ConfigTableConstruct;
  readonly quotaTable: QuotaTableConstruct;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.network = new NetworkConstruct(this, 'Network');
    this.kms = new KmsConstruct(this, 'Kms');
    this.configTable = new ConfigTableConstruct(this, 'Config', { kmsKey: this.kms.ddbKey });
    this.quotaTable = new QuotaTableConstruct(this, 'Quota', { kmsKey: this.kms.ddbKey });
  }
}
