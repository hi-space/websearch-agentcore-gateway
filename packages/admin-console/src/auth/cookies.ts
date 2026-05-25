// Cookie name constants. Kept separate from oauth.ts so middleware (which runs on the edge
// runtime) can import them without pulling in node:crypto.
export const SESSION_COOKIE = 'id_token';
export const PKCE_COOKIE = 'oauth_pkce';
