import { Construct } from 'constructs';
import { Duration, RemovalPolicy, Stack, SecretValue } from 'aws-cdk-lib';
import {
  UserPool,
  UserPoolClient,
  UserPoolDomain,
  UserPoolResourceServer,
  ResourceServerScope,
  OAuthScope,
  AccountRecovery,
  StringAttribute,
  CfnUserPoolGroup,
  UserPoolIdentityProviderOidc,
  UserPoolIdentityProviderSaml,
  UserPoolIdentityProviderSamlMetadata,
  UserPoolClientIdentityProvider,
  ProviderAttribute
} from 'aws-cdk-lib/aws-cognito';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';

export type CognitoFederationSpec =
  | {
      type: 'oidc';
      providerName: string;
      issuerUrl: string;
      clientId: string;
      clientSecret: SecretValue;
      scopes?: string[];
      attributeMapping?: Record<string, string>;
    }
  | {
      type: 'saml';
      providerName: string;
      metadataUrl: string;
      attributeMapping?: Record<string, string>;
    };

export interface CognitoConstructProps {
  /**
   * Optional federation IdP. When supplied, the user-facing client will accept
   * sign-ins via this provider in addition to native Cognito users. Operators
   * can wire IAM Identity Center, Okta, Azure AD, etc. without code changes.
   */
  federation?: CognitoFederationSpec;
}

export class CognitoConstruct extends Construct {
  readonly userPool: UserPool;
  /** @deprecated kept for compatibility — use {@link userClient}. */
  readonly client: UserPoolClient;
  /** PKCE public client used by Claude Desktop / mcp-bridge / admin console UI. */
  readonly userClient: UserPoolClient;
  /** Confidential client for headless workloads (CI, batch). */
  readonly m2mClient: UserPoolClient;
  /** Secrets Manager secret holding the m2m client_secret. */
  readonly m2mClientSecret: Secret;
  /** Fully-qualified scope: `gateway/invoke`. */
  readonly gatewayScope: string;
  readonly discoveryUrl: string;
  readonly hostedUiDomain: UserPoolDomain;
  readonly hostedUiBaseUrl: string;

  constructor(scope: Construct, id: string, props: CognitoConstructProps = {}) {
    super(scope, id);

    this.userPool = new UserPool(this, 'AdminUserPool', {
      userPoolName: `${Stack.of(this).stackName}-admin`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
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

    // Resource server defines the audience that Gateway tokens are scoped to.
    // The fully-qualified scope `gateway/invoke` is what the bridge requests
    // and what AgentCore Gateway expects in the access token's `scope` claim.
    const invokeScope = new ResourceServerScope({
      scopeName: 'invoke',
      scopeDescription: 'Invoke search tools via AgentCore Gateway'
    });
    const resourceServer = new UserPoolResourceServer(this, 'GatewayResourceServer', {
      userPool: this.userPool,
      identifier: 'gateway',
      scopes: [invokeScope]
    });
    this.gatewayScope = `gateway/${invokeScope.scopeName}`;

    // Optional federation IdP. Created before clients so we can list it on
    // `supportedIdentityProviders` without a circular dep.
    const federationProviders: UserPoolClientIdentityProvider[] = [UserPoolClientIdentityProvider.COGNITO];
    if (props.federation) {
      const federationProvider = this.attachFederationProvider(props.federation);
      federationProviders.push(UserPoolClientIdentityProvider.custom(props.federation.providerName));
      // The L2 dependency must be explicit since identity providers are referenced by string.
      this.node.addDependency(federationProvider);
    }

    // PKCE public client. Callbacks include 127.0.0.1 ranges (RFC 8252) so the
    // local mcp-bridge can spin up an ephemeral http server on any free port.
    // Refresh-token rotation is enabled with a 30s overlap so the bridge's
    // single retry on 401 succeeds even if a refresh response is in-flight.
    this.userClient = this.userPool.addClient('GatewayUserClient', {
      userPoolClientName: 'gateway-user',
      authFlows: { userSrp: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      // Setting refreshTokenRotationGracePeriod implicitly enables rotation in
      // the L2; 30s is enough overlap for the bridge's single retry-on-401.
      refreshTokenRotationGracePeriod: Duration.seconds(30),
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(8),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          OAuthScope.OPENID,
          OAuthScope.EMAIL,
          OAuthScope.PROFILE,
          OAuthScope.resourceServer(resourceServer, invokeScope)
        ],
        // 127.0.0.1 with a fixed loopback port range. Cognito doesn't allow
        // wildcard ports, so we register a small set the bridge will pick from.
        callbackUrls: LOOPBACK_REDIRECT_PORTS.map((p) => `http://127.0.0.1:${p}/callback`),
        logoutUrls: LOOPBACK_REDIRECT_PORTS.map((p) => `http://127.0.0.1:${p}/logout`)
      },
      supportedIdentityProviders: federationProviders
    });

    // Confidential client for headless workloads. client_credentials only —
    // no user context, only a `gateway/invoke` audience.
    this.m2mClient = this.userPool.addClient('GatewayM2mClient', {
      userPoolClientName: 'gateway-m2m',
      generateSecret: true,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [OAuthScope.resourceServer(resourceServer, invokeScope)]
      }
    });

    // Cognito does not surface the m2m client secret as a CloudFormation
    // attribute; we have to read it via the API and tee it into Secrets
    // Manager so operators can rotate / IAM-restrict access.
    this.m2mClientSecret = this.exposeM2mSecret();

    // Backwards-compatible alias: stacks/scripts that still read `cognito.client`
    // get the user client (same role as before, now PKCE-enabled).
    this.client = this.userClient;

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    this.discoveryUrl = `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}/.well-known/openid-configuration`;

    const prefix = `agentcore-admin-${account}`;
    this.hostedUiDomain = this.userPool.addDomain('AdminHostedUi', {
      cognitoDomain: { domainPrefix: prefix }
    });
    this.hostedUiBaseUrl = `https://${prefix}.auth.${region}.amazoncognito.com`;
  }

  private attachFederationProvider(spec: CognitoFederationSpec): Construct {
    const defaultAttrs = {
      email: ProviderAttribute.other('email').attributeName,
      name: ProviderAttribute.other('name').attributeName
    };
    if (spec.type === 'oidc') {
      return new UserPoolIdentityProviderOidc(this, `Federation-${spec.providerName}`, {
        userPool: this.userPool,
        name: spec.providerName,
        issuerUrl: spec.issuerUrl,
        clientId: spec.clientId,
        clientSecret: spec.clientSecret.unsafeUnwrap(),
        scopes: spec.scopes ?? ['openid', 'email', 'profile'],
        attributeMapping: spec.attributeMapping
          ? Object.fromEntries(
              Object.entries(spec.attributeMapping).map(([k, v]) => [k, ProviderAttribute.other(v)])
            )
          : {
              email: ProviderAttribute.other(defaultAttrs.email),
              fullname: ProviderAttribute.other(defaultAttrs.name)
            }
      });
    }
    return new UserPoolIdentityProviderSaml(this, `Federation-${spec.providerName}`, {
      userPool: this.userPool,
      name: spec.providerName,
      metadata: UserPoolIdentityProviderSamlMetadata.url(spec.metadataUrl),
      attributeMapping: spec.attributeMapping
        ? Object.fromEntries(
            Object.entries(spec.attributeMapping).map(([k, v]) => [k, ProviderAttribute.other(v)])
          )
        : undefined
    });
  }

  /**
   * Reads the m2m client_secret via DescribeUserPoolClient at deploy time and
   * stores it in Secrets Manager. The secret is tagged with the client id so
   * operators can find which client a rotation belongs to.
   */
  private exposeM2mSecret(): Secret {
    const secret = new Secret(this, 'M2mClientSecret', {
      secretName: `${Stack.of(this).stackName}/cognito/gateway-m2m`,
      description: 'Cognito gateway-m2m client_secret used by headless workloads to mint Bearer tokens for AgentCore Gateway'
    });
    NagSuppressions.addResourceSuppressions(secret, [
      {
        id: 'AwsSolutions-SMG4',
        reason:
          'Cognito does not expose a programmatic rotation contract for app-client secrets — rotating the Cognito client requires `update-user-pool-client` plus a coordinated update of every workload using the secret. v1 surfaces the secret in Secrets Manager so operators can rotate via runbook; an automated rotation Lambda is tracked as a v1.1 follow-up.'
      }
    ]);

    const fetchSecret = new AwsCustomResource(this, 'M2mClientSecretFetch', {
      onCreate: this.describeClientCall(),
      onUpdate: this.describeClientCall(),
      installLatestAwsSdk: false,
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['cognito-idp:DescribeUserPoolClient'],
          resources: [this.userPool.userPoolArn]
        })
      ])
    });
    fetchSecret.node.addDependency(this.m2mClient);

    const clientSecretValue = fetchSecret.getResponseField('UserPoolClient.ClientSecret');

    new AwsCustomResource(this, 'M2mClientSecretWrite', {
      onCreate: {
        service: 'SecretsManager',
        action: 'putSecretValue',
        parameters: {
          SecretId: secret.secretArn,
          SecretString: clientSecretValue
        },
        physicalResourceId: PhysicalResourceId.of(`${secret.secretArn}-write`)
      },
      onUpdate: {
        service: 'SecretsManager',
        action: 'putSecretValue',
        parameters: {
          SecretId: secret.secretArn,
          SecretString: clientSecretValue
        },
        physicalResourceId: PhysicalResourceId.of(`${secret.secretArn}-write`)
      },
      installLatestAwsSdk: false,
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['secretsmanager:PutSecretValue'],
          resources: [secret.secretArn]
        })
      ])
    }).node.addDependency(fetchSecret);

    return secret;
  }

  private describeClientCall() {
    return {
      service: 'CognitoIdentityServiceProvider',
      action: 'describeUserPoolClient',
      parameters: {
        UserPoolId: this.userPool.userPoolId,
        ClientId: this.m2mClient.userPoolClientId
      },
      physicalResourceId: PhysicalResourceId.of(`${this.m2mClient.userPoolClientId}-describe`)
    };
  }
}

// Reserved loopback ports the mcp-bridge will try in order. Cognito requires
// callback URLs to be registered statically; this set is large enough that a
// free port is almost always available, small enough to keep the client config
// readable.
export const LOOPBACK_REDIRECT_PORTS = [33991, 33992, 33993, 33994, 33995] as const;
