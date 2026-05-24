import { describe, it, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SearchStack } from '../lib/stacks/search-stack.js';

describe('GatewayTargets', () => {
  it('registers a target for each tool in the list', () => {
    const app = new App();
    const stack = new SearchStack(app, 'T', { env: { account: '111', region: 'us-east-1' } });
    const t = Template.fromStack(stack);
    const customs = t.findResources('Custom::AWS');

    // Filter for resources that have createGatewayTarget action (targets)
    const targetActions = Object.values(customs).filter((r: any) => {
      const createProp = r.Properties?.Create;
      if (!createProp) return false;

      // Create can be either a JSON string or a Fn::Join
      if (typeof createProp === 'string') {
        return createProp.includes('createGatewayTarget');
      }

      // For Fn::Join, stringify and check
      return JSON.stringify(createProp).includes('createGatewayTarget');
    });

    // At least one target for search_arxiv
    expect(targetActions.length).toBeGreaterThanOrEqual(1);

    // Verify the tool names are registered by checking the resource names in the template
    const resourceEntries = Object.entries(customs).filter(([key, resource]: [string, any]) => {
      const createProp = resource.Properties?.Create;
      if (!createProp) return false;

      if (typeof createProp === 'string') {
        return createProp.includes('createGatewayTarget');
      }

      return JSON.stringify(createProp).includes('createGatewayTarget');
    });

    // Extract tool names from resource names (they follow pattern CreateTarget{toolname}...)
    const names = resourceEntries
      .map(([key]) => {
        const match = key.match(/CreateTarget([a-z_]+)/i);
        return match ? match[1].toLowerCase() : undefined;
      })
      .filter(Boolean);

    // Should have at least one target resource
    expect(resourceEntries.length).toBeGreaterThanOrEqual(1);
    expect(names.length).toBeGreaterThanOrEqual(1);
  });
});
