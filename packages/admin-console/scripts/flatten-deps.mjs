#!/usr/bin/env node
// Flatten only Next.js runtime peer deps into the standalone tree as real dirs,
// because CDK dereferences pnpm symlinks and breaks peer resolution.
import { mkdirSync, cpSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(__dirname, '..', 'dist');
const targetNodeModules = resolve(distRoot, 'packages/admin-console/node_modules');
const sourceRepoRoot = resolve(__dirname, '..', '..', '..');
const sourcePnpm = resolve(sourceRepoRoot, 'node_modules/.pnpm');

if (!existsSync(sourcePnpm)) {
  console.error(`[flatten-deps] no pnpm tree at ${sourcePnpm}`);
  process.exit(1);
}

// Find a package's source dir by name across .pnpm/<hash>/node_modules/<name>.
// Picks the first match (any version is fine — pnpm dedupes within a project).
function findPkg(name) {
  for (const entry of readdirSync(sourcePnpm)) {
    const candidate = join(sourcePnpm, entry, 'node_modules', name);
    try { if (statSync(candidate).isDirectory()) return candidate; } catch {}
  }
  return null;
}

mkdirSync(targetNodeModules, { recursive: true });

// Strategy: flatten the entire peer set that pnpm placed alongside `next` —
// these are exactly the modules Next can require via Node's CJS resolver
// when its own real-path is at .pnpm/next@.../node_modules/next/.
// Plus a handful of additional runtime peers Next pulls from elsewhere.

// Native swc binary suffix matching the Lambda runtime architecture.
// Drop all other @next/swc-* native packages — they're build-time only.
const KEEP_SWC_BINARY = process.env.LAMBDA_ARCH === 'x86_64'
  ? '@next/swc-linux-x64-gnu'
  : '@next/swc-linux-arm64-gnu';
const nextPeerDir = (() => {
  for (const entry of readdirSync(sourcePnpm)) {
    if (entry.startsWith('next@')) {
      const dir = join(sourcePnpm, entry, 'node_modules');
      if (existsSync(dir)) return dir;
    }
  }
  return null;
})();

if (!nextPeerDir) {
  console.error('[flatten-deps] could not find next@... in pnpm tree');
  process.exit(1);
}

let copied = 0;
let replaced = 0;

function copyPkg(src, dst) {
  if (existsSync(dst)) {
    rmSync(dst, { recursive: true, force: true });
    replaced++;
  }
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: true });
  copied++;
}

// 1) Everything in next's peer node_modules — handles next, react, styled-jsx, @next/*, @swc/*, etc.
for (const pkg of readdirSync(nextPeerDir)) {
  const src = join(nextPeerDir, pkg);
  let stat;
  try { stat = statSync(src); } catch { continue; }
  if (!stat.isDirectory()) continue;
  if (pkg.startsWith('@')) {
    for (const sub of readdirSync(src)) {
      const fqn = `${pkg}/${sub}`;
      if (sub.startsWith('swc-') && fqn !== KEEP_SWC_BINARY) continue;
      copyPkg(join(src, sub), join(targetNodeModules, pkg, sub));
    }
  } else {
    copyPkg(src, join(targetNodeModules, pkg));
  }
}

// 2) Extra runtime deps Next loads via require-hook or shared lib that may not be in next's peer dir.
const extras = ['client-only', 'scheduler', 'tslib'];
for (const name of extras) {
  if (existsSync(join(targetNodeModules, name))) continue;
  const src = findPkg(name);
  if (!src) continue;
  copyPkg(src, join(targetNodeModules, name));
}

// 3) Prune build-time only files inside next/dist to fit Lambda 250MB unzipped limit.
//    Keep dist/server/, dist/shared/, dist/compiled/* needed at runtime.
const nextDist = join(targetNodeModules, 'next/dist');
for (const sub of ['cli', 'bin', 'esm', 'swc']) {
  const p = join(nextDist, sub);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
// Drop heavy build-time compiled bundles. Server runtime uses dist/compiled/webpack/* (bundle5.js)
// and the prod runtimes inside dist/compiled/next-server/.
const compiledDir = join(nextDist, 'compiled');
const dropCompiled = [
  'turbopack',
  'react-dom-experimental', 'react-server-dom-turbopack', 'react-server-dom-turbopack-experimental',
  'react-server-dom-webpack-experimental'
];
for (const sub of dropCompiled) {
  const p = join(compiledDir, sub);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
// Inside next-server: keep only non-turbo, non-experimental, non-dev .prod.js (drop sourcemaps too).
const nextServerDir = join(compiledDir, 'next-server');
if (existsSync(nextServerDir)) {
  for (const f of readdirSync(nextServerDir)) {
    const drop = f.endsWith('.map')
      || f.includes('turbo')
      || f.includes('experimental')
      || f.endsWith('.dev.js');
    if (drop) rmSync(join(nextServerDir, f), { force: true });
  }
}

console.log(`[flatten-deps] copied ${copied}, replaced ${replaced} into ${targetNodeModules}`);
