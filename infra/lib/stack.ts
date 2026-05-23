import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NetworkConstruct } from './network/index.js';

export class SearchGatewayStack extends Stack {
  readonly network: NetworkConstruct;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.network = new NetworkConstruct(this, 'Network');
  }
}
