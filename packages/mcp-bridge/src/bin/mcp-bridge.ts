#!/usr/bin/env node
import { main } from '../index.js';

main().catch((err: Error) => {
  process.stderr.write(`[mcp-bridge] fatal: ${err.message}\n`);
  process.exit(1);
});
