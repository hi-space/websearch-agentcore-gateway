import Link from 'next/link';
import { Button } from '../../src/ui/Button';
import { JourneyStepCard, JourneyPath, type JourneyStep } from '../../src/ui/JourneyStepCard';
import { ResourceCard } from '../../src/ui/ResourceCard';
import { ChecklistCard } from '../../src/ui/ChecklistCard';
import { DeliverablesPanel } from '../../src/ui/DeliverablesPanel';
import { FaqAccordion } from '../../src/ui/FaqAccordion';
import { SupportPanel } from '../../src/ui/SupportPanel';

export const dynamic = 'force-dynamic';

const journey: JourneyStep[] = [
  { number: '01', label: 'Setup', title: 'Provision the gateway', description: 'Run cdk deploy to create Cognito, DynamoDB, KMS, and the AgentCore Gateway in your account.' },
  { number: '02', label: 'Identity', title: 'Sign in with Cognito', description: 'Authenticate with the Cognito Hosted UI. Privileged actions are recorded in the audit log.' },
  { number: '03', label: 'Providers', title: 'Configure providers', description: 'Toggle providers on/off, set RPM and daily quotas, configure timeouts inline.' },
  { number: '04', label: 'Secrets', title: 'Store API credentials', description: 'New secret values are written to AWS Secrets Manager. Old versions remain for safe rollback.' },
  { number: '05', label: 'Verify', title: 'Run a connectivity test', description: 'Probe upstream search via the router. Each test emits an audit row attributed to your identity.' },
  { number: '06', label: 'Audit', title: 'Review the audit trail', description: 'Every change is captured with actor, before/after diff, and a hash-chained timestamp.' },
  { number: '07', label: 'Operate', title: 'Watch metrics & rotate', description: 'CloudWatch p95 latency and error rate inform when to rotate keys or shift provider weight.' }
];

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-hairline bg-canvas">
        <div className="max-w-[1180px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-none bg-ink text-canvas inline-flex items-center justify-center font-medium">S</span>
            <span className="font-display text-heading-lg uppercase tracking-tight text-ink">search-gateway</span>
          </div>
          <Link href="/api/auth/login">
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-[1180px] mx-auto px-6 pt-20 pb-12">
        <div className="rounded-none border border-hairline bg-canvas p-8 md:p-12 grid md:grid-cols-2 gap-10 items-center min-h-[468px]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-none border border-hairline bg-canvas px-3 py-1 text-caption-sm uppercase tracking-wide text-ink">
              Operator console
            </span>
            <h1 className="mt-6 font-display text-display-mega text-ink uppercase leading-[0.9]">
              Run your search gateway with operational confidence.
            </h1>
            <p className="mt-6 text-body-md text-charcoal max-w-xl leading-relaxed">
              Provision providers, rotate API credentials, and review a hash-chained audit trail. Every privileged
              action is recorded.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/api/auth/login">
                <Button variant="dark">Sign in with Cognito</Button>
              </Link>
              <a href="https://docs.aws.amazon.com/cognito/" target="_blank" rel="noreferrer">
                <Button variant="link">Learn about Cognito →</Button>
              </a>
            </div>
            <p className="mt-6 text-caption-sm text-muted">
              By signing in you agree that all actions are recorded for compliance review.
            </p>
          </div>
          <div className="relative">
            <div className="rounded-none bg-ink text-onDark p-6 relative overflow-hidden">
              <div className="grid-pattern absolute inset-0 opacity-30 pointer-events-none" aria-hidden="true" />
              <div className="relative">
                <div className="text-caption-sm uppercase tracking-wide text-darkOnSurfaceMuted">Live console preview</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PreviewStat label="Providers" value="6 / 8" hint="enabled" />
                  <PreviewStat label="p95 latency" value="142 ms" hint="last hour" />
                  <PreviewStat label="Error rate" value="0.42 %" hint="last hour" />
                  <PreviewStat label="Reveals" value="2" hint="this hour" />
                </div>
                <div className="mt-4 rounded-none bg-white/[0.03] border border-darkOutline px-4 py-3 text-body-sm text-darkOnSurfaceMuted font-mono">
                  connectivity_test · <span className="text-success">ok</span> · 18 results · provider <span className="text-onDark">exa</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* JOURNEY */}
      <section className="max-w-[1180px] mx-auto px-6 pt-20 pb-20">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-caption-sm uppercase tracking-wide text-muted">Onboarding journey</span>
          <h2 className="mt-3 font-display text-display-lg text-ink uppercase leading-[0.9]">From provision to production in seven steps.</h2>
          <p className="mt-4 text-body-md text-charcoal">
            Each step has an inline runbook link, expected duration, and an audit row when applied through the console.
          </p>
        </div>
        <div className="mt-10 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {journey.slice(0, 4).map((s) => (
            <JourneyStepCard key={s.number} step={s} />
          ))}
        </div>
        <JourneyPath count={4} />
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 lg:max-w-[882px] lg:mx-auto">
          {journey.slice(4).map((s) => (
            <JourneyStepCard key={s.number} step={s} />
          ))}
        </div>
      </section>

      {/* CHECKLIST */}
      <section className="max-w-[1180px] mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-caption-sm uppercase tracking-wide text-muted">Operational standards</span>
          <h2 className="mt-3 font-display text-display-lg text-ink uppercase leading-[0.9]">Field rules every operator follows.</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <ChecklistCard
            title="Secret hygiene"
            items={[
              'Rotate provider keys at least every 90 days',
              'Reveal only with a logged business reason',
              'Stage replacements before disabling old version'
            ]}
          />
          <ChecklistCard
            title="Quota discipline"
            items={[
              'Set RPM below upstream burst ceiling',
              'Tune daily quota to last through UTC midnight',
              'Watch error rate when nudging timeout downward'
            ]}
          />
          <ChecklistCard
            title="Change control"
            items={[
              'Configuration saves emit an audit row',
              'Reveals require a written reason and are audited',
              'Disable providers via toggle, not by deleting secrets'
            ]}
          />
        </div>
      </section>

      {/* RESOURCES */}
      <section className="max-w-[1180px] mx-auto px-6 py-20">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <span className="text-caption-sm uppercase tracking-wide text-muted">Quick access</span>
            <h2 className="mt-3 font-display text-display-lg text-ink uppercase leading-[0.9]">Resources operators reach for.</h2>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <ResourceCard category="Capture" title="Sign in" description="Cognito Hosted UI." href="/api/auth/login" />
          <ResourceCard category="Console" title="Provider catalog" description="Toggle, throttle, and configure upstream providers." href="/admin/providers" />
          <ResourceCard category="Console" title="Audit log" description="Filter by actor, action, and time. Export to S3 in v1.1." href="/admin/audit" />
          <ResourceCard category="Reference" title="Architecture" description="See the v1.0 walking-skeleton plan." href="https://github.com/" external />
        </div>
      </section>

      {/* DELIVERABLES */}
      <section className="max-w-[1180px] mx-auto px-6 py-20">
        <DeliverablesPanel
          eyebrow="What you ship"
          title="Operationally honest, auditable search."
          description="The console produces a paper trail other teams can verify without asking you."
          chips={[
            { id: 'audit', label: 'Audit log', value: 'Hash-chained', hint: '90-day DDB retention' },
            { id: 'reveals', label: 'Reveals', value: 'Reason + actor', hint: 'every reveal audited' },
            { id: 'metrics', label: 'Metrics', value: 'CloudWatch', hint: 'p95 + error rate' }
          ]}
        />
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <span className="text-caption-sm uppercase tracking-wide text-muted">Troubleshooting</span>
          <h2 className="mt-3 font-display text-display-lg text-ink uppercase leading-[0.9]">Frequently asked.</h2>
        </div>
        <FaqAccordion
          items={[
            { q: 'How is a secret reveal recorded?', a: 'Each reveal writes an audit row with the operator identity and the reason text. The row is append-only and retained for 90 days.' },
            { q: 'How do I add a new upstream search provider?', a: 'Add an adapter under packages/adapters and register it via the connector framework. CDK seeds the provider config row on next deploy. v1.x will surface a console form.' },
            { q: 'How long does the audit log retain rows?', a: 'Rows live for 90 days in DynamoDB. Daily export to S3 is in v1.1.' },
            { q: 'Can I deploy this to a region other than us-east-1?', a: 'Yes. Set AWS_REGION in CDK context and re-deploy. Cognito and Bedrock-adjacent services need to be available in your target region.' }
          ]}
        />
      </section>

      {/* SUPPORT */}
      <section className="max-w-[1180px] mx-auto px-6 pt-4 pb-20">
        <SupportPanel
          title="Need a hand getting onboarded?"
          description="Open the runbook, file an issue, or reach the platform team. We answer within one business day."
          primary={{ label: 'Open runbook', href: 'https://github.com/' }}
          secondary={{ label: 'File an issue', href: 'https://github.com/' }}
        />
      </section>

      <footer className="border-t border-hairline bg-canvas">
        <div className="max-w-[1180px] mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-body-sm text-charcoal">
          <span>© search-gateway · operator console</span>
          <span>v1.0 walking-skeleton</span>
        </div>
      </footer>
    </div>
  );
}

function PreviewStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-none bg-white/[0.03] border border-darkOutline px-4 py-3">
      <div className="text-caption-sm uppercase tracking-wide text-darkOnSurfaceSubtle">{label}</div>
      <div className="mt-1 text-heading-lg text-onDark tabular-nums">{value}</div>
      <div className="text-caption-sm text-darkOnSurfaceMuted">{hint}</div>
    </div>
  );
}
