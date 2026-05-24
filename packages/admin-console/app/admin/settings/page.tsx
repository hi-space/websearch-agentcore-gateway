import { Card } from '../../../src/ui/Card';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? '(not set)';
  const gatewayId = process.env.AGENTCORE_GATEWAY_ID ?? '(not set)';
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <h2 className="text-lg font-semibold mb-3">Deployment</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="opacity-70">Region</dt><dd>{region}</dd>
          <dt className="opacity-70">Cognito User Pool</dt><dd className="font-mono">{userPoolId}</dd>
          <dt className="opacity-70">AgentCore Gateway</dt><dd className="font-mono">{gatewayId}</dd>
        </dl>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold mb-3">Operator</h2>
        <p className="text-sm opacity-80">
          Account changes (password, MFA enrollment) are managed in Cognito Hosted UI. Provider
          enable / quotas / secrets are managed under <span className="font-mono">Providers</span>.
        </p>
      </Card>
    </div>
  );
}
