import { Card, CardHeader } from '../../../src/ui/Card';
import { Badge } from '../../../src/ui/Badge';
import { FaqAccordion } from '../../../src/ui/FaqAccordion';
import { StatRow } from '../../../src/ui/StatRow';

export const dynamic = 'force-dynamic';

interface Setting {
  label: string;
  value: string;
  hint?: string;
  isSecret?: boolean;
}

function deploymentSettings(): Setting[] {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? '(not set)';
  const gatewayId = process.env.AGENTCORE_GATEWAY_ID ?? '(not set)';
  const configTable = process.env.PROVIDER_CONFIG_TABLE ?? '(not set)';
  const auditTable = process.env.AUDIT_TABLE ?? '(not set)';
  const replayTable = process.env.REPLAY_TABLE ?? '(not set)';
  const mfaKeyId = process.env.MFA_KMS_KEY_ID ?? '(not set)';
  const routerArn = process.env.ROUTER_LAMBDA_ARN ?? '(not set)';
  return [
    { label: 'AWS Region', value: region },
    { label: 'Cognito User Pool', value: userPoolId, hint: 'Operator identity provider.' },
    { label: 'AgentCore Gateway', value: gatewayId, hint: 'Connector dispatch surface.' },
    { label: 'Router Lambda', value: routerArn, hint: 'Connectivity tests invoke this.' },
    { label: 'Provider config table', value: configTable },
    { label: 'Audit table', value: auditTable },
    { label: 'Replay table', value: replayTable, hint: 'Single-use MFA assertion guard.' },
    { label: 'MFA KMS key id', value: mfaKeyId, hint: 'Signs step-up assertions.' }
  ];
}

export default function SettingsPage() {
  const items = deploymentSettings();
  const total = items.length;
  const set = items.filter((i) => i.value !== '(not set)').length;

  return (
    <div className="space-y-8">
      <StatRow
        items={[
          { label: 'Deployment', value: `${set} / ${total}`, hint: 'environment variables resolved' },
          { label: 'Region', value: process.env.AWS_REGION ?? 'us-east-1' },
          { label: 'Step-up MFA', value: 'KMS-signed', hint: 'rate-limited 5/hr per actor' },
          { label: 'Audit retention', value: '90 days', hint: 'append-only DDB' }
        ]}
      />

      <Card variant="panel">
        <CardHeader
          title="Deployment metadata"
          subtitle="These values are injected by CDK at deploy time. Edit infra/lib/stack.ts to change them."
        />
        <div className="rounded-2xl border border-outline overflow-hidden">
          <table className="w-full text-body-sm">
            <thead className="bg-background text-label-sm uppercase tracking-wider text-stone">
              <tr>
                <th className="text-left px-5 py-3 font-bold w-64">Setting</th>
                <th className="text-left px-5 py-3 font-bold">Value</th>
                <th className="text-left px-5 py-3 font-bold w-40">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.label} className="border-t border-outline">
                  <td className="px-5 py-3 text-onBackground">
                    <div className="text-body-sm-medium">{it.label}</div>
                    {it.hint && <div className="text-caption text-slate">{it.hint}</div>}
                  </td>
                  <td className="px-5 py-3 font-mono text-caption text-onBackground break-all">{it.value}</td>
                  <td className="px-5 py-3">
                    {it.value === '(not set)' ? (
                      <Badge tone="warning">missing</Badge>
                    ) : (
                      <Badge tone="success">configured</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card variant="panel">
        <CardHeader title="Operator account" subtitle="Account changes are managed through Cognito Hosted UI." />
        <p className="text-body-md text-slate leading-relaxed">
          Password resets, MFA enrollment, and identity attributes are managed in your Cognito user pool. Provider
          enablement, quotas, and credential rotation live under{' '}
          <span className="font-mono text-onBackground">/admin/providers</span>.
        </p>
      </Card>

      <Card variant="panel">
        <CardHeader title="Frequently asked" />
        <FaqAccordion
          items={[
            {
              q: 'Why does revealing a secret require MFA every time?',
              a: 'Reveals are explicitly out-of-band: each one consumes a one-time KMS-signed assertion and is rate-limited to 5 per hour per actor. The intent is that key material exposure leaves a trail no operator can quietly bypass.'
            },
            {
              q: 'How do I add a new upstream search provider?',
              a: 'Add an adapter under packages/adapters and register it via the connector framework. CDK seeds the provider config row on next deploy. v1.x will surface a console form for ad-hoc registration.'
            },
            {
              q: 'How long does the audit log retain rows?',
              a: 'Rows live for 90 days in DynamoDB. Daily export to S3 (Glue-cataloged) is in v1.1 — see the audit-export package.'
            },
            {
              q: 'Can I deploy this to a region other than us-east-1?',
              a: 'Yes. Set AWS_REGION in the CDK context and re-deploy. Cognito and Bedrock-adjacent services need to be available in your target region.'
            }
          ]}
        />
      </Card>
    </div>
  );
}
