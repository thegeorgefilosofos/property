#!/usr/bin/env node
// Χτίζει τον πάγκο κινητού. Ιδιο ψευδώνυμο βάσης με τον perf-bench, αλλά με
// ΟΛΟΚΛΗΡΟ το globals.css — αλλιώς λείπουν .card/.app-content και όλα τα
// media queries, δηλαδή ό,τι ακριβώς κρίνεται σε στενή οθόνη.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(root, '.perf-bench');
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'mobile.tsx')],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2022',
  outfile: join(out, 'mobile.js'),
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'text' },
  alias: {
    '@/lib/supabase/client': join(here, '../e2e-money/fakeClient.ts'),
    '@': root,
  },
});

const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
writeFileSync(join(out, 'globals.css'), css);
writeFileSync(join(out, 'mobile.html'), `<!doctype html><html lang="el" data-mode="dark" data-theme="midnight"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Πάγκος κινητού</title>
<link rel="stylesheet" href="./globals.css">
<style>html,body{margin:0;padding:0}</style>
</head><body><script src="./mobile.js"></script></body></html>`);

console.log('✓ ο πάγκος κινητού χτίστηκε στο .perf-bench/mobile.html');
