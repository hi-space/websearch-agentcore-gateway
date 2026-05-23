import { CognitoJwtVerifier } from 'aws-jwt-verify';

export interface VerifierConfig {
  userPoolId: string;
  clientId: string;
}

export interface AuthCtx {
  sub: string;
  email?: string;
  role: 'admin' | 'editor' | 'viewer';
}

type VerifierFactory = (cfg: VerifierConfig) => { verify(token: string): Promise<{ sub: string; email?: string; 'cognito:groups'?: string[] }> };

const defaultFactory: VerifierFactory = (cfg) =>
  CognitoJwtVerifier.create({ userPoolId: cfg.userPoolId, clientId: cfg.clientId, tokenUse: 'access' });

export function makeVerifier(cfg: VerifierConfig, factory: VerifierFactory = defaultFactory) {
  const v = factory(cfg);
  return async (token: string): Promise<AuthCtx> => {
    const payload = await v.verify(token);
    const groups = payload['cognito:groups'] ?? [];
    const role: AuthCtx['role'] = groups.includes('admin') ? 'admin' : groups.includes('editor') ? 'editor' : 'viewer';
    const result: AuthCtx = { sub: payload.sub, role };
    if (payload.email) {
      result.email = payload.email;
    }
    return result;
  };
}
