import { z } from 'zod';

export const Category = z.enum(['web', 'academic']);
export type Category = z.infer<typeof Category>;

export const SearchResult = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  snippet: z.string(),
  publishedAt: z.string().datetime().optional(),
  provider: z.string().min(1),
  rank: z.number().int().positive().optional(),
  score: z.number().optional(),
  raw: z.unknown().optional()
});
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchOpts = z.object({
  topK: z.number().int().positive().max(50).optional().default(10),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional()
});
export type SearchOpts = z.infer<typeof SearchOpts>;

export interface Adapter {
  readonly name: string;
  readonly category: Category;
  readonly requiresApiKey: boolean;
  search(query: string, opts?: SearchOpts): Promise<SearchResult[]>;
}
