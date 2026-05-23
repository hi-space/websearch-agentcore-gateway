import { describe, it, expect, vi } from 'vitest';
import { makeVerifier } from '../verify-jwt.js';

const stubJwt = {
  verify: vi.fn().mockResolvedValue({
    sub: 'user-1',
    email: 'a@b.c',
    'cognito:groups': ['admin']
  })
};

describe('makeVerifier', () => {
  it('returns subject + role on a good token', async () => {
    const v = makeVerifier({ userPoolId: 'p', clientId: 'c' }, () => stubJwt as any);
    const out = await v('eyJ...');
    expect(out).toEqual({ sub: 'user-1', email: 'a@b.c', role: 'admin' });
  });

  it('throws on a bad token', async () => {
    const bad = { verify: vi.fn().mockRejectedValue(new Error('bad')) };
    const v = makeVerifier({ userPoolId: 'p', clientId: 'c' }, () => bad as any);
    await expect(v('xxx')).rejects.toThrow('bad');
  });

  it('returns viewer role when no admin group', async () => {
    const noGroup = { verify: vi.fn().mockResolvedValue({ sub: 'u', 'cognito:groups': [] }) };
    const v = makeVerifier({ userPoolId: 'p', clientId: 'c' }, () => noGroup as any);
    expect((await v('t')).role).toBe('viewer');
  });
});
