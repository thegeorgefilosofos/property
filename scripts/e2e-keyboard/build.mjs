#!/usr/bin/env node
// Χτίζει τον πάγκο πληκτρολογίου: τα ΑΛΗΘΙΝΑ διαδραστικά στοιχεία του πίνακα
// ελέγχου, με ολόκληρο το globals.css, χωρίς διακομιστή και χωρίς λογαριασμό.
// Ίδιο ιδίωμα με τον πάγκο κινητού, ίδιο ψευδώνυμο για τον πελάτη της βάσης.
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
  outfile: join(out, 'keyboard.js'),
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'text' },
  alias: {
    '@/lib/supabase/client': join(here, '../e2e-money/fakeClient.ts'),
    '@': root,
  },
});

writeFileSync(join(out, 'globals.css'), readFileSync(join(root, 'app/globals.css'), 'utf8'));
writeFileSync(join(out, 'keyboard.html'), `<!doctype html><html lang="el" data-mode="dark" data-theme="midnight"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Πάγκος πληκτρολογίου</title>
<link rel="stylesheet" href="./globals.css">
<style>html,body{margin:0;padding:0}</style>
</head><body><script src="./keyboard.js"></script></body></html>`);

console.log('✓ ο πάγκος πληκτρολογίου χτίστηκε στο .perf-bench/keyboard.html');
