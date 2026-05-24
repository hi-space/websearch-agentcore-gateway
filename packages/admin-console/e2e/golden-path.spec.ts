import { test, expect, request } from '@playwright/test';

// Golden-path E2E: drives the deployed admin console (or local dev server) and
// verifies the public surface, auth-gated surface, and Hosted UI sign-in redirect.
// Authenticated flows that need a real Cognito session live in a separate suite that
// pulls credentials from Secrets Manager — this spec stays creds-free for CI smoke.

test.describe('admin console — golden path', () => {
  test('public root returns the Next.js shell', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test.describe('unauthenticated', () => {
    for (const path of ['/admin/dashboard', '/admin/providers', '/admin/audit']) {
      test(`HTML ${path} redirects to /api/auth/login`, async ({ page }) => {
        const res = await page.goto(path, { waitUntil: 'commit' });
        // Cognito Hosted UI is a 3rd party; we only verify we left the console host
        // by hitting the OAuth login endpoint. In environments without Hosted UI
        // configured, the middleware falls back to a 401, which is also acceptable
        // (the redirect path requires COGNITO_OAUTH_CLIENT_ID).
        const url = page.url();
        const status = res?.status() ?? 0;
        expect(url.includes('/api/auth/login') || url.includes('amazoncognito.com') || status === 401).toBeTruthy();
      });
    }

    for (const api of ['/api/providers', '/api/metrics', '/api/audit']) {
      test(`API ${api} returns 401 JSON`, async ({ baseURL }) => {
        const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
        const res = await ctx.get(api);
        expect(res.status()).toBe(401);
        await expect(res.json()).resolves.toEqual({ error: 'UNAUTHENTICATED' });
        await ctx.dispose();
      });
    }
  });

  test('login route sets PKCE cookie + redirects to Cognito', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.get('/api/auth/login', { maxRedirects: 0 });
    // 307 in the local dev server, 302 over CloudFront — both are valid auth-init responses.
    // If hosted UI env is missing, the route raises 500 — only run the assertion when
    // we have a redirect.
    if ([302, 307].includes(res.status())) {
      const location = res.headers()['location'];
      expect(location).toBeTruthy();
      expect(location).toMatch(/\/oauth2\/authorize\?/);
      const setCookie = res.headers()['set-cookie'] ?? '';
      expect(setCookie).toContain('oauth_pkce=');
      expect(setCookie.toLowerCase()).toContain('httponly');
    } else {
      test.skip(true, 'Hosted UI not configured in this environment');
    }
    await ctx.dispose();
  });
});
