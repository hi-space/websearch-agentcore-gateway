import { Construct } from 'constructs';
import { CfnDistribution, CfnOriginAccessControl, Function as CfFunction, FunctionCode, FunctionEventType } from 'aws-cdk-lib/aws-cloudfront';

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

  // CloudFront overwrites the Host header with the origin domain (lambda-url) before forwarding.
  // We need the viewer's host on the Lambda side so the Next.js BFF can build OAuth callback URLs
  // pointing at the user-facing CloudFront domain. Stamp it onto X-Forwarded-Host at the edge.
  // Note: X-Forwarded-Proto is on CloudFront Functions' disallowed-header list; CloudFront sets
  // CloudFront-Forwarded-Proto natively, and the viewer protocol policy here is redirect-to-https,
  // so the Lambda can safely default to https when X-Forwarded-Proto is absent.
  const hostForwarder = new CfFunction(scope, `${id}HostForwarder`, {
    functionName: `${id}HostForwarder`,
    code: FunctionCode.fromInline(
      `function handler(event){var r=event.request;if(r.headers.host){r.headers['x-forwarded-host']={value:r.headers.host.value};}return r;}`
    )
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
            'x-csrf-token',
            'x-forwarded-host'
          ]
        },
        functionAssociations: [
          {
            eventType: FunctionEventType.VIEWER_REQUEST,
            functionArn: hostForwarder.functionArn
          }
        ],
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
