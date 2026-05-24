export interface DiffInput {
  ddb: string[];
  gateway: string[];
}

export interface DiffOutput {
  missing: string[];
  extra: string[];
}

export function diffTargets(input: DiffInput): DiffOutput {
  const ddbSet = new Set(input.ddb);
  const gwSet = new Set(input.gateway);
  return {
    missing: input.ddb.filter((x) => !gwSet.has(x)),
    extra: input.gateway.filter((x) => !ddbSet.has(x))
  };
}
