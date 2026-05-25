import React from 'react';
import Link from 'next/link';

export interface ResourceCardProps {
  category: string;
  title: string;
  description: string;
  href: string;
  icon?: React.ReactNode;
  external?: boolean;
}

export function ResourceCard({ category, title, description, href, icon, external }: ResourceCardProps) {
  const content = (
    <div className="rounded-lg border border-hairline bg-surface p-6 lift-on-hover h-full flex flex-col">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-md bg-surfaceMuted text-ink inline-flex items-center justify-center">
          {icon ?? <ResourceGlyph />}
        </span>
        <span className="text-caption-uppercase text-muted">{category}</span>
      </div>
      <h3 className="text-display-sm text-ink leading-tight">{title}</h3>
      <p className="mt-3 text-body-md text-body leading-relaxed flex-1">{description}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-body-sm-medium text-ink group">
        {external ? 'Open' : 'View'}
        <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
      </span>
    </div>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className="block focus:outline-none focus:ring-2 focus:ring-ink/20 rounded-lg">
      {content}
    </a>
  ) : (
    <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-ink/20 rounded-lg">
      {content}
    </Link>
  );
}

function ResourceGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7L17 8.5V15.5A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-11Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 3v5h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
