import { Construct } from 'constructs';
import {
  AttributeType, BillingMode, Table, TableEncryption
} from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';

export interface ConfigTableProps { kmsKey: IKey }

export class ConfigTableConstruct extends Construct {
  readonly table: Table;
  constructor(scope: Construct, id: string, props: ConfigTableProps) {
    super(scope, id);
    this.table = new Table(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      removalPolicy: RemovalPolicy.RETAIN
    });
  }
}
