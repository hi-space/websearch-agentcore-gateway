import { Construct } from 'constructs';
import { CfnDistribution } from 'aws-cdk-lib/aws-cloudfront';

export function buildCloudFront(
  scope: Construct,
  id: string,
  fnUrlDomain: string,
  webAclArn: string
): CfnDistribution {
  return new CfnDistribution(scope, id, {
    distributionConfig: {
      enabled: true,
      webAclId: webAclArn,
      defaultCacheBehavior: {
        viewerProtocolPolicy: 'redirect-to-https',
        targetOriginId: 'lambda-origin',
        forwardedValues: {
          queryString: true,
          cookies: { forward: 'all' },
          headers: ['*']
        },
        allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
        cachedMethods: ['GET', 'HEAD'],
        compress: true,
        defaultTtl: 0,
        maxTtl: 0,
        minTtl: 0
      },
      origins: [
        {
          id: 'lambda-origin',
          domainName: fnUrlDomain,
          customOriginConfig: {
            originProtocolPolicy: 'https-only',
            originSslProtocols: ['TLSv1.2']
          }
        }
      ]
    }
  });
}
