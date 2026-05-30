import type { TokenManager } from './auth/manager.js';

export interface AuthorizedFetchOpts {
  manager: TokenManager;
  fetchImpl?: typeof fetch;
}

/**
 * Wraps `fetch` so every request carries `Authorization: Bearer <access>` and
 * a single 401 response triggers a force-refresh + one retry. The retry path
 * is bounded — a second 401 surfaces to the caller, who treats it as
 * authoritative and asks the user to re-authenticate.
 */
export function createAuthorizedFetch(opts: AuthorizedFetchOpts): typeof fetch {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const send = async (token: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${token}`);
      return fetchImpl(input, { ...init, headers });
    };

    let token = await opts.manager.getAccessToken();
    let res = await send(token);
    if (res.status !== 401) return res;

    // Drain the body before retrying — undici will leak sockets otherwise.
    await res.body?.cancel().catch(() => undefined);
    token = await opts.manager.forceRefresh();
    res = await send(token);
    return res;
  };
}
