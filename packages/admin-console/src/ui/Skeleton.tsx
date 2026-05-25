import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-outline/60 rounded-xl ${className}`} aria-hidden="true" />;
}
