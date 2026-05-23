import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NetworkConstruct } from './network/index.js';
import { KmsConstruct } from './security/kms.js';

export class SearchGatewayStack extends Stack {
  readonly network: NetworkConstruct;
  readonly kms: KmsConstruct;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.network = new NetworkConstruct(this, 'Network');
    this.kms = new KmsConstruct(this, 'Kms');
  }
}
