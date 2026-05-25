import { describe, it, expect } from 'vitest';
import { Stack } from 'aws-cdk-lib';
import { enableGuardDuty } from '../lib/security/guardduty.js';
import { enableSecurityHub } from '../lib/security/securityhub.js';
import { Template } from 'aws-cdk-lib/assertions';

describe('Security flags', () => {
  it('enableGuardDuty creates a detector', () => {
    const stack = new Stack();
    enableGuardDuty(stack);
    const t = Template.fromStack(stack);
    const detectors = t.findResources('AWS::GuardDuty::Detector');
    expect(Object.keys(detectors)).toHaveLength(1);
    expect((detectors as any)[Object.keys(detectors)[0]].Properties?.Enable).toBe(true);
  });

  it('enableSecurityHub creates a hub', () => {
    const stack = new Stack();
    enableSecurityHub(stack);
    const t = Template.fromStack(stack);
    const hubs = t.findResources('AWS::SecurityHub::Hub');
    expect(Object.keys(hubs)).toHaveLength(1);
  });

  it('stacks without flags do not have GuardDuty or SecurityHub', () => {
    const stack = new Stack();
    const t = Template.fromStack(stack);
    expect(Object.keys(t.findResources('AWS::GuardDuty::Detector'))).toHaveLength(0);
    expect(Object.keys(t.findResources('AWS::SecurityHub::Hub'))).toHaveLength(0);
  });
});
