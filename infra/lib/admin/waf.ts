import { Construct } from 'constructs';
import {
  CfnWebACL,
  CfnWebACLProps
} from 'aws-cdk-lib/aws-wafv2';

export function buildWebAcl(scope: Construct, id: string): CfnWebACL {
  return new CfnWebACL(scope, id, {
    scope: 'CLOUDFRONT',
    defaultAction: { allow: {} },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: `${id}-metrics`,
      sampledRequestsEnabled: true
    },
    rules: [
      {
        priority: 0,
        name: 'AWSManagedRulesCommonRuleSet',
        statement: {
          managedRuleGroupStatement: {
            name: 'AWSManagedRulesCommonRuleSet',
            vendorName: 'AWS'
          }
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${id}-common-rule-set`,
          sampledRequestsEnabled: true
        }
      },
      {
        priority: 1,
        name: 'RateBasedRule',
        statement: {
          rateBasedStatement: {
            limit: 1000,
            aggregateKeyType: 'IP'
          }
        },
        action: { block: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${id}-rate-based`,
          sampledRequestsEnabled: true
        }
      }
    ]
  });
}
