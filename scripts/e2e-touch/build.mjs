#!/usr/bin/env node
// Χτίζει τον πάγκο αφής: τον ΑΛΗΘΙΝΟ βοηθό μέσα σε ψηλή σελίδα, με ολόκληρο
// το globals.css, χωρίς διακομιστή και χωρίς λογαριασμό. Ιδιο ιδίωμα με τον
// πάγκο κινητού, ίδιο ψευδώνυμο για τον πελάτη της βάσης.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(root, '.perf-bench');
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'bench.tsx')],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2022',
  outfile: join(out, 'touch.js'),
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'text' },
  alias: {
    '@/lib/supabase/client': join(here, '../e2e-money/fakeClient.ts'),
    '@': root,
  },
});

writeFileSync(join(out, 'globals.css'), readFileSync(join(root, 'app/globals.css'), 'utf8'));
writeFileSync(join(out, 'touch.html'), `<!doctype html><html lang="el" data-mode="dark" data-theme="midnight"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Πάγκος αφής</title>
<link rel="stylesheet" href="./globals.css">
<style>html,body{margin:0;padding:0}</style>
</head><body><script src="./touch.js"></script></body></html>`);

console.log('✓ ο πάγκος αφής χτίστηκε στο .perf-bench/touch.html');
