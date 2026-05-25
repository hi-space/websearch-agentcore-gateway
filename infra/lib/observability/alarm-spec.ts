export interface AlarmDefinition {
  id: string;
  metricName: string;
  dimensions: Record<string, string>;
  threshold: number;
  evaluationPeriods: number;
  statistic: string;
  period: number;
  comparator: 'GreaterThanThreshold' | 'LessThanThreshold';
}

const PROVIDER_ALARMS: Array<Omit<AlarmDefinition, 'id' | 'dimensions'> & { suffix: string }> = [
  { suffix: 'errorRate', metricName: 'ErrorRate', threshold: 0.05, evaluationPeriods: 3, statistic: 'Average', period: 60, comparator: 'GreaterThanThreshold' },
  { suffix: 'p95', metricName: 'Latency', threshold: 5000, evaluationPeriods: 5, statistic: 'p95', period: 60, comparator: 'GreaterThanThreshold' },
  { suffix: 'quota', metricName: 'QuotaSaturation', threshold: 0.9, evaluationPeriods: 3, statistic: 'Average', period: 60, comparator: 'GreaterThanThreshold' },
  { suffix: 'fanOut', metricName: 'FanOutFailures', threshold: 3, evaluationPeriods: 3, statistic: 'Sum', period: 60, comparator: 'GreaterThanThreshold' }
];

const ADMIN_ALARMS: Array<Omit<AlarmDefinition, 'id' | 'dimensions'> & { suffix: string }> = [
  { suffix: 'revealSpike', metricName: 'RevealCount', threshold: 10, evaluationPeriods: 1, statistic: 'Sum', period: 300, comparator: 'GreaterThanThreshold' },
  { suffix: 'errorRate', metricName: 'AdminErrors', threshold: 5, evaluationPeriods: 3, statistic: 'Sum', period: 60, comparator: 'GreaterThanThreshold' }
];

export function listAlarmDefinitions(providers: string[]): AlarmDefinition[] {
  const out: AlarmDefinition[] = [];
  for (const p of providers) {
    for (const a of PROVIDER_ALARMS) {
      out.push({ id: `${p}.${a.suffix}`, dimensions: { provider: p }, ...a });
    }
  }
  for (const a of ADMIN_ALARMS) {
    out.push({ id: `admin.${a.suffix}`, dimensions: {}, ...a });
  }
  return out;
}
