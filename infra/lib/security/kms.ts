import { Construct } from 'constructs';
import { Key, KeySpec, KeyUsage } from 'aws-cdk-lib/aws-kms';
import { RemovalPolicy } from 'aws-cdk-lib';

export class KmsConstruct extends Construct {
  readonly secretsKey: Key;
  readonly ddbKey: Key;
  readonly logsKey: Key;
  readonly s3Key: Key;
  readonly mfaSigningKey: Key;

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
    // Asymmetric signing key for step-up MFA assertions (5-min RSA-PSS tokens).
    // RSA_2048 + RSASSA_PSS_SHA_256 — rotation not supported by KMS for asymmetric keys,
    // but the assertion itself is short-lived (5 min), so key compromise window is bounded.
    this.mfaSigningKey = new Key(this, 'MfaSigning', {
      removalPolicy: RemovalPolicy.RETAIN,
      keySpec: KeySpec.RSA_2048,
      keyUsage: KeyUsage.SIGN_VERIFY,
      description: 'search-agentcore-gateway MFA assertion signer'
    });
  }
}
