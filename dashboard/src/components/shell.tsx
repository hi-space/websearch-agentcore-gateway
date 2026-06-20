'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap,
  BarChart3,
  Gauge,
  FileText,
  Radio,
  Activity,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

export const NAV_ITEMS: Array<{
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
}> = [
  { label: 'Inspector', href: '/inspector', icon: Zap, hint: 'MCP 도구 테스트' },
  { label: 'LLM', href: '/llm', icon: Sparkles, hint: 'LLM 라우팅' },
  { label: 'Observability', href: '/observability', icon: BarChart3, hint: 'CloudWatch 메트릭' },
  { label: 'Traces', href: '/traces', icon: Activity, hint: 'X-Ray 트레이스' },
  { label: 'Playground', href: '/playground', icon: Gauge, hint: '엔진 비교' },
  { label: 'Audit', href: '/audit', icon: FileText, hint: 'Logs Insights' },
];

/** Animated brand mark — a "signal" pulse evoking the search gateway. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex h-9 w-9 items-center justify-center', className)}>
      <span
        className="spin-ring absolute inset-0 rounded-xl opacity-80"
        style={{
          background:
            'conic-gradient(from 0deg, transparent, var(--primary), transparent 65%)',
          animation: 'spin-slow 6s linear infinite',
        }}
      />
      <span className="absolute inset-[1.5px] rounded-[0.65rem] bg-card" />
      <Radio className="relative h-[18px] w-[18px] text-primary" strokeWidth={2.25} />
    </span>
  );
}

function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
            )}
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            <span className="flex flex-col leading-tight">
              <span className="font-medium">{item.label}</span>
              <span className="text-[11px] text-muted-foreground">{item.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * AppShell — the persistent product chrome: brand rail on the left, a sticky
 * page header on the right. Inner pages render their content as children.
 */
export function AppShell({
  title,
  description,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="surface-glass sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r lg:flex">
        <Link href="/" className="flex items-center gap-3 px-5 py-6">
          <BrandMark />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-bold tracking-tight">Websearch</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary/80">
              Gateway
            </span>
          </span>
        </Link>

        <div className="px-3">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Console
          </p>
          <SidebarNav />
        </div>

        <div className="mt-auto px-5 py-5">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
            <span className="live-dot h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
            <span className="text-xs text-muted-foreground">
              Gateway <span className="text-foreground">온라인</span>
            </span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="surface-glass sticky top-0 z-20 border-b">
          <div className="flex items-center gap-4 px-5 py-4 sm:px-8">
            {/* Mobile brand */}
            <Link href="/" className="lg:hidden">
              <BrandMark />
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              {Icon && (
                <span className="hidden h-10 w-10 items-center justify-center rounded-xl border bg-muted/50 sm:inline-flex">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
              )}
              <div className="min-w-0">
                <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
                {description && (
                  <p className="truncate text-sm text-muted-foreground">{description}</p>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {actions}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-7xl animate-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}
