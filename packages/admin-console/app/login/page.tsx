import Link from 'next/link';
import { Button } from '../../src/ui/Button';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <section className="relative bg-brandNavy text-onDark overflow-hidden">
        <div className="mesh-wire" aria-hidden="true" />
        <div className="relative max-w-2xl mx-auto px-6 pt-24 pb-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brandNavyMid/80 border border-brandNavyHairline px-3 py-1 text-caption-bold text-onDarkMuted">
            <span className="w-1.5 h-1.5 rounded-full bg-semanticSuccess" /> Operator console
          </span>

          <h1 className="mt-6 text-heading-1 text-onDark leading-tight tracking-tight">
            search-gateway control plane
          </h1>

          <p className="mt-4 text-body-md text-onDarkMuted max-w-xl mx-auto leading-relaxed">
            Manage upstream providers, rotate API credentials, and review the audit trail. All privileged
            operations are MFA-gated and recorded.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/api/auth/login">
              <Button variant="primary">Sign in with Cognito</Button>
            </Link>
            <a href="https://docs.aws.amazon.com/cognito/" target="_blank" rel="noreferrer">
              <Button variant="secondary-on-dark">Learn about MFA</Button>
            </a>
          </div>

          <p className="mt-6 text-caption text-onDarkSubtle">
            By signing in you agree that all actions are recorded for compliance review.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16 w-full">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            title="Provider control"
            body="Toggle providers on/off, set RPM and daily quotas, and configure timeouts inline."
          />
          <FeatureCard
            title="Step-up MFA reveals"
            body="Secret reveals require a fresh KMS-signed assertion. Each reveal is rate-limited and audited."
          />
          <FeatureCard
            title="Audit-first"
            body="Every change is captured with actor, before/after diff, and a hash-chained timestamp."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-6">
      <h3 className="text-heading-5 text-ink leading-tight tracking-tight">{title}</h3>
      <p className="mt-2 text-body-sm text-steel leading-relaxed">{body}</p>
    </div>
  );
}
