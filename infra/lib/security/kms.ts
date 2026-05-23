import { Construct } from 'constructs';
import { Key, KeySpec, KeyUsage } from 'aws-cdk-lib/aws-kms';
import { RemovalPolicy } from 'aws-cdk-lib';

export class KmsConstruct extends Construct {
  readonly secretsKey: Key;
  readonly ddbKey: Key;
  readonly logsKey: Key;
  readonly s3Key: Key;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const make = (name: string) => new Key(this, name, {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
      keySpec: KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: KeyUsage.ENCRYPT_DECRYPT,
      description: `search-agentcore-gateway ${name}`
    });
    this.secretsKey = make('Secrets');
    this.ddbKey = make('Ddb');
    this.logsKey = make('Logs');
    this.s3Key = make('S3');
  }
}
