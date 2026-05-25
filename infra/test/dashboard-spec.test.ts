import { describe, it, expect } from 'vitest';
import { buildDashboardBody } from '../lib/observability/dashboard-spec.js';

describe('buildDashboardBody', () => {
  it('produces one widget per provider plus a unified summary widget', () => {
    const body = buildDashboardBody({
      providers: ['exa', 'tavily'],
      namespace: 'SearchGateway',
      region: 'us-east-1'
    });
    const parsed = JSON.parse(body);
    const titles = parsed.widgets.map((w: any) => w.properties.title);
    expect(titles).toContain('exa');
    expect(titles).toContain('tavily');
    expect(titles).toContain('search_unified');
    expect(titles).toContain('admin');
  });
});
