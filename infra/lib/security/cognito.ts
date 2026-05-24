import { Construct } from 'constructs';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  UserPool,
  UserPoolClient,
  UserPoolDomain,
  AccountRecovery,
  Mfa,
  StringAttribute,
  CfnUserPoolGroup
} from 'aws-cdk-lib/aws-cognito';

export class CognitoConstruct extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly discoveryUrl: string;
  readonly hostedUiDomain: UserPoolDomain;
  readonly hostedUiBaseUrl: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new UserPool(this, 'AdminUserPool', {
      userPoolName: `${Stack.of(this).stackName}-admin`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      standardAttributes: {
        email: { required: true, mutable: true }
      },
      customAttributes: {
        role: new StringAttribute({ mutable: true })
      },
      removalPolicy: RemovalPolicy.DESTROY
    });

    new CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      description: 'Admin Console operators'
    });

    this.client = this.userPool.addClient('GatewayClient', {
      userPoolClientName: 'agentcore-gateway',
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: undefined,
      accessTokenValidity: undefined,
      refreshTokenValidity: undefined
    });

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    this.discoveryUrl = `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}/.well-known/openid-configuration`;

    // Hosted UI domain — region-unique prefix, derived from account ID for stability across redeploys.
    // The admin OAuth client lives in AdminConsoleStack so its callback can reference the CloudFront domain
    // without creating a cycle between the two stacks.
    const prefix = `agentcore-admin-${account}`;
    this.hostedUiDomain = this.userPool.addDomain('AdminHostedUi', {
      cognitoDomain: { domainPrefix: prefix }
    });
    this.hostedUiBaseUrl = `https://${prefix}.auth.${region}.amazoncognito.com`;
  }
}
