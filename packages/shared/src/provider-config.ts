import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  providerId: z.string().min(1),
  enabled: z.boolean(),
  secretArn: z.string().optional(),
  quota: z.object({ rpm: z.number().int().nonnegative(), daily: z.number().int().nonnegative() }),
  timeoutMs: z.number().int().positive()
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export function parseProviderConfig(row: unknown): ProviderConfig {
  return ProviderConfigSchema.parse(row);
}
