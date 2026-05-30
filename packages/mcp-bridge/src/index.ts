import { TokenManager } from './auth/manager.js';
import { startBridge } from './bridge.js';

const LOOPBACK_PORTS = [33991, 33992, 33993, 33994, 33995] as const;

export interface BridgeEnv {
  gatewayUrl: string;
  cognitoDomain: string;
  clientId: string;
  scope: string;
  region: string;
  profile: string;
}

function readEnv(env: NodeJS.ProcessEnv = process.env): BridgeEnv {
  const required = (key: string): string => {
    const v = env[key];
    if (!v || v.length === 0) throw new Error(`${key} is required`);
    return v;
  };
  return {
    gatewayUrl: required('GATEWAY_URL'),
    cognitoDomain: required('COGNITO_DOMAIN'),
    clientId: required('COGNITO_CLIENT_ID'),
    scope: env.COGNITO_SCOPE ?? 'gateway/invoke openid email profile',
    region: required('COGNITO_REGION'),
    profile: env.BRIDGE_PROFILE ?? 'default'
  };
}

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const cfg = readEnv(env);
  const manager = await TokenManager.create({
    profile: cfg.profile,
    cognitoDomain: cfg.cognitoDomain,
    clientId: cfg.clientId,
    scope: cfg.scope,
    loopbackPorts: LOOPBACK_PORTS
  });
  await startBridge({
    gatewayUrl: cfg.gatewayUrl,
    manager
  });
}

export { TokenManager } from './auth/manager.js';
export { startBridge } from './bridge.js';
export { createAuthorizedFetch } from './http.js';
export type { TokenSet } from './auth/token.js';
