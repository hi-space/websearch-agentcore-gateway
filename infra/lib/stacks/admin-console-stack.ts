import { Stack, StackProps, CfnOutput, Duration, Fn, SymlinkFollowMode } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Function, Runtime, Code, Architecture, Tracing, CfnPermission } from 'aws-cdk-lib/aws-lambda';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildWebAcl } from '../admin/waf.js';
import { buildCloudFront } from '../admin/cloudfront.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export interface AdminConsoleStackProps extends StackProps {
  vpc: IVpc;
  configTable: ITable;
  searchRouterFn: IFunction;
  secretsKmsKey: IKey;
  auditTableName?: string;
  secretArnPrefix?: string;
  adminAssetPath?: string;
  userPoolId: string;
  userPoolClientId: string;
}

export class AdminConsoleStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminConsoleStackProps) {
    super(scope, id, props);

    const auditTableName = props.auditTableName ?? 'AuditLogTable';
    const secretArnPrefix = props.secretArnPrefix
      ?? `arn:aws:secretsmanager:${this.region}:${this.account}:secret:gateway/providers/*`;

    // Determine asset path
    const defaultAssetPath = resolve(__dirname, '../../../packages/admin-console/dist');
    const assetPath = props.adminAssetPath ?? defaultAssetPath;

    // Check if asset path exists
    if (!existsSync(assetPath)) {
      this.node.addWarning(
        `Admin Console asset directory does not exist at ${assetPath}. ` +
        'Please run: pnpm --filter admin-console build:lambda'
      );
    }

    // Create Lambda function
    const fn = new Function(this, 'Function', {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      handler: 'packages/admin-console/lambda-entry.handler',
      code: Code.fromAsset(assetPath, { followSymlinks: SymlinkFollowMode.NEVER }),
      memorySize: 1024,
      timeout: Duration.seconds(15),
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      tracing: Tracing.ACTIVE,
      environment: {
        CONFIG_TABLE: props.configTable.tableName,
        AUDIT_TABLE: auditTableName,
        SEARCH_ROUTER_ARN: props.searchRouterFn.functionArn,
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId
      }
    });

    // Grant permissions to ConfigTable
    props.configTable.grantReadData(fn);
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['dynamodb:UpdateItem'],
        resources: [props.configTable.tableArn]
      })
    );

    // Grant permissions to AuditLogTable
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${auditTableName}`]
      })
    );

    // Grant Secrets Manager access
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:PutSecretValue'],
        resources: [secretArnPrefix]
      })
    );

    // Grant KMS key access
    props.secretsKmsKey.grantDecrypt(fn);

    // Grant Lambda invoke permission
    props.searchRouterFn.grantInvoke(fn);

    // Grant CloudWatch metrics access
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudwatch:GetMetricData'],
        resources: ['*']
      })
    );

    // Create Function URL
    const fnUrl = fn.addFunctionUrl({
      authType: 'AWS_IAM'
    });

    // Create WAF WebACL
    const webAcl = buildWebAcl(this, 'AdminWebAcl');

    // Extract hostname from function URL using Fn.select to handle tokens
    // fnUrl.url is like: https://abcd1234.lambda-url.us-east-1.on.aws/
    // We need just: abcd1234.lambda-url.us-east-1.on.aws
    const fnUrlDomain = Fn.select(2, Fn.split('/', fnUrl.url));

    // Create CloudFront distribution
    const distribution = buildCloudFront(this, 'AdminDistribution', fnUrlDomain, webAcl.attrArn);

    // Allow only this CloudFront distribution to invoke the Function URL via OAC SigV4.
    // Per AWS docs, OAC for Lambda requires BOTH InvokeFunctionUrl and InvokeFunction.
    new CfnPermission(this, 'AdminFnUrlInvokeFromCloudFront', {
      action: 'lambda:InvokeFunctionUrl',
      functionName: fn.functionArn,
      principal: 'cloudfront.amazonaws.com',
      functionUrlAuthType: 'AWS_IAM',
      sourceArn: `arn:aws:cloudfront::${this.account}:distribution/${distribution.attrId}`
    });
    new CfnPermission(this, 'AdminFnInvokeFromCloudFront', {
      action: 'lambda:InvokeFunction',
      functionName: fn.functionArn,
      principal: 'cloudfront.amazonaws.com',
      sourceArn: `arn:aws:cloudfront::${this.account}:distribution/${distribution.attrId}`
    });

    // Outputs
    new CfnOutput(this, 'AdminDistDomainName', {
      value: distribution.attrDomainName,
      description: 'CloudFront domain for Admin Console'
    });

    new CfnOutput(this, 'AdminFunctionUrl', {
      value: fnUrl.url,
      description: 'Lambda Function URL'
    });
  }
}
