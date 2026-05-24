import { Construct } from 'constructs';
import {
  AttributeType, BillingMode, Table, TableEncryption
} from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';

export interface MfaReplayTableProps { kmsKey: IKey }

// Holds two row kinds, both keyed (pk, sk) with TTL:
//   - assertion#<fingerprint>      → single-use replay guard (5-min TTL)
//   - reveal#<actor>#<hour-bucket> → hourly counter for cap enforcement (2-hour TTL)
export class MfaReplayTableConstruct extends Construct {
  readonly table: Table;
  constructor(scope: Construct, id: string, props: MfaReplayTableProps) {
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

    NagSuppressions.addResourceSuppressions(this.table, [
      {
        id: 'AwsSolutions-DDB3',
        reason: 'MfaReplayTable rows are ephemeral (5-min assertion fingerprints + hourly counters with TTL ≤ 2h). PITR is irrelevant: replay protection only needs to outlive the assertion lifetime; counter loss only resets the per-actor hourly cap, not security posture (audit log + SNS alarm remain authoritative).'
      }
    ]);
  }
}
