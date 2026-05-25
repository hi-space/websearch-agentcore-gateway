import { Construct } from 'constructs';
import {
  AttributeType, BillingMode, Table, TableEncryption
} from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';

export interface QuotaTableProps { kmsKey: IKey }

export class QuotaTableConstruct extends Construct {
  readonly table: Table;
  constructor(scope: Construct, id: string, props: QuotaTableProps) {
    super(scope, id);
    this.table = new Table(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // QuotaTable is ephemeral (RPM/daily quotas with TTL ≤ 24h).
    // Point-in-time recovery is unnecessary: table loss is recoverable in <60s
    // by re-creation; PITR adds cost without operational value. Durable tables
    // (ConfigTable, AuditLogTable) have PITR enabled.
    NagSuppressions.addResourceSuppressions(this.table, [
      {
        id: 'AwsSolutions-DDB3',
        reason: 'QuotaTable rows are ephemeral RPM/daily counters with TTL ≤ 24h. Loss of the table is recoverable in <60s by recreation; PITR provides no operational value and adds cost. ConfigTable and AuditLogTable (durable) have PITR enabled.'
      }
    ]);
  }
}
