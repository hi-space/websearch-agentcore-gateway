# admin-console E2E suite

Playwright-driven end-to-end smoke for the deployed admin console.

## Run against a deployed environment

```bash
ADMIN_URL=https://<cloudfront-domain> pnpm --filter admin-console test:e2e
```

The `golden-path.spec.ts` file drives the **unauthenticated** surface — public
shell, auth-gated 401s, and the Cognito Hosted UI redirect setup. It does
**not** require a Cognito session and is safe to run in CI.

## Run against a local dev server

```bash
pnpm --filter admin-console dev   # in one terminal
ADMIN_URL=http://localhost:3000 pnpm --filter admin-console test:e2e
```

The login-redirect assertion is automatically skipped when
`COGNITO_OAUTH_CLIENT_ID` is not configured locally.

## First-time browser install

```bash
pnpm --filter admin-console exec playwright install chromium
```
