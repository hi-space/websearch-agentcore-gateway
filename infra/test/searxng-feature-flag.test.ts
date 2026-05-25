import { describe, it, expect } from 'vitest';
import { Stack } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Template } from 'aws-cdk-lib/assertions';
import { SearchStack } from '../lib/stacks/search-stack.js';

describe('SearchStack with enableSearxng feature flag', () => {
  it('does not create ECS service when enableSearxng is not set', () => {
    const stack = new SearchStack(new Stack(), 'TestStack', {});
    const template = Template.fromStack(stack);

    // Should NOT have an ECS service
    template.resourceCountIs('AWS::ECS::Service', 0);
  });

  it('creates ECS service when enableSearxng is true', () => {
    const stack = new SearchStack(new Stack(), 'TestStack', { enableSearxng: true });
    const template = Template.fromStack(stack);

    // Should have exactly one ECS service
    template.resourceCountIs('AWS::ECS::Service', 1);

    // Should have an ALB
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);

    // Should have a target group
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
  });
});
