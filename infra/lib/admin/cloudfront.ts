import { Construct } from 'constructs';
import { CfnDistribution, CfnOriginAccessControl } from 'aws-cdk-lib/aws-cloudfront';

export function buildCloudFront(
  scope: Construct,
  id: string,
  fnUrlDomain: string,
  webAclArn: string
): CfnDistribution {
  const oac = new CfnOriginAccessControl(scope, `${id}Oac`, {
    originAccessControlConfig: {
      name: `${id}Oac`,
      originAccessControlOriginType: 'lambda',
      signingBehavior: 'always',
      signingProtocol: 'sigv4'
    }
  });

  return new CfnDistribution(scope, id, {
    distributionConfig: {
      enabled: true,
      webAclId: webAclArn,
      defaultCacheBehavior: {
        viewerProtocolPolicy: 'redirect-to-https',
        targetOriginId: 'lambda-origin',
        // CloudFront -> Lambda URL OAC: CloudFront signs the request itself,
        // so we must NOT forward an inbound Authorization header (it would
        // collide with CloudFront's SigV4 signing). Forward everything else
        // we need for the Next.js BFF (cookies, query string, host).
        forwardedValues: {
          queryString: true,
          cookies: { forward: 'all' },
          headers: [
            'Accept',
            'Accept-Language',
            'Content-Type',
            'Origin',
            'Referer',
            'User-Agent',
            'x-csrf-token'
          ]
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
          originAccessControlId: oac.attrId,
          customOriginConfig: {
            originProtocolPolicy: 'https-only',
            originSslProtocols: ['TLSv1.2']
          }
        }
      ]
    }
  });
}
