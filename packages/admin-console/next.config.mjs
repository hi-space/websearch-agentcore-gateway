import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  output: 'standalone',
  outputFileTracingRoot: resolve(__dirname, '../..'),
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ['*'] } }
};
