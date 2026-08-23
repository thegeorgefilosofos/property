#!/usr/bin/env node
// Χτίζει τον πάγκο απόδοσης σε ένα αρχείο, με ψευδώνυμο μόνο για τη βάση.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(root, '.perf-form');
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'harness.tsx')],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2022',
  outfile: join(out, 'harness.js'),
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    '@/lib/supabase/client': join(here, '../e2e-money/fakeClient.ts'),
    '@': root,
  },
});

const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const vars = (css.match(/:root,\s*\n?\[data-mode="dark"\]\s*\{[\s\S]*?\n\}/) || css.match(/:root\s*\{[\s\S]*?\n\}/) || [''])[0];

writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="el"><head>
<meta charset="utf-8"><title>Πάγκος απόδοσης</title>
<style>${vars}
body{margin:0;font-family:system-ui,sans-serif;background:var(--bg-base,#fff);color:var(--text-primary,#111)}</style>
</head><body><script src="./harness.js"></script></body></html>`);

console.log('✓ ο πάγκος φορμών χτίστηκε στο .perf-form');
