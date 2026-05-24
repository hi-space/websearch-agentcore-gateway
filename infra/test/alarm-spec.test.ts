import { describe, it, expect } from 'vitest';
import { listAlarmDefinitions } from '../lib/observability/alarm-spec.js';

describe('listAlarmDefinitions', () => {
  it('returns 4 alarm definitions per enabled provider plus 2 admin alarms', () => {
    const defs = listAlarmDefinitions(['exa', 'tavily']);
    // per provider: error rate, p95, quota saturation, fan-out failure
    expect(defs.filter((d) => d.id.startsWith('exa.'))).toHaveLength(4);
    expect(defs.filter((d) => d.id.startsWith('tavily.'))).toHaveLength(4);
    // admin: reveal-rate spike, admin error rate
    expect(defs.filter((d) => d.id.startsWith('admin.'))).toHaveLength(2);
  });
});
