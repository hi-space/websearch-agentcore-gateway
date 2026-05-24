import { Construct } from 'constructs';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  UserPool,
  UserPoolClient,
  AccountRecovery,
  Mfa,
  StringAttribute,
  CfnUserPoolGroup
} from 'aws-cdk-lib/aws-cognito';

export class CognitoConstruct extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly discoveryUrl: string;

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
    this.discoveryUrl = `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}/.well-known/openid-configuration`;
  }
}
