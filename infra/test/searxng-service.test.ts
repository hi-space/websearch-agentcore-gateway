import { describe, it, expect } from 'vitest';
import { Stack } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Template } from 'aws-cdk-lib/assertions';
import { SearxngService } from '../lib/searxng/searxng-service.js';

describe('SearxngService', () => {
  it('creates an ECS cluster, Fargate task definition, and service', () => {
    const stack = new Stack();
    const vpc = new Vpc(stack, 'Vpc');

    new SearxngService(stack, 'Searxng', { vpc, desiredCount: 2 });

    const template = Template.fromStack(stack);

    // Check that an ECS cluster is created
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterSettings: [{ Name: 'containerInsights', Value: 'enabled' }]
    });

    // Check that a Fargate task definition is created with correct cpu and memory
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: '512',
      Memory: '1024'
    });

    // Check that a Fargate service is created with desiredCount = 2
    template.hasResourceProperties('AWS::ECS::Service', {
      DesiredCount: 2,
      LaunchType: 'FARGATE',
      ServiceName: 'searxng'
    });
  });

  it('creates an internal ALB with a target group and health check', () => {
    const stack = new Stack();
    const vpc = new Vpc(stack, 'Vpc');

    new SearxngService(stack, 'Searxng', { vpc });

    const template = Template.fromStack(stack);

    // Check ALB is created (internal)
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Type: 'application',
      Scheme: 'internal',
      Name: 'searxng-internal'
    });

    // Check target group with health check
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Port: 8080,
      Protocol: 'HTTP',
      TargetType: 'ip',
      HealthCheckPath: '/healthz',
      HealthCheckIntervalSeconds: 30,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      HealthCheckTimeoutSeconds: 5
    });
  });
});
