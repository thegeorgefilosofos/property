#!/usr/bin/env node
// Χτίζει τον πάγκο της εγγραφής σε ΕΝΑ αρχείο. Ψευδώνυμο μόνο για τον πελάτη
// ταυτότητας και για το `next/link`, που εκτός Next δεν έχει δρομολογητή.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(root, '.e2e-signup');
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
    '@/lib/supabase/lazy': join(here, 'fakeAuth.ts'),
    'next/link': join(here, 'fakeLink.tsx'),
    '@': root,
  },
});

const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const vars = (css.match(/:root\s*\{[\s\S]*?\}/) || [''])[0];

writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="el"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Πάγκος εγγραφής</title>
<style>${vars}
body{margin:0;font-family:system-ui,sans-serif;background:var(--bg-page,#fff);color:var(--text-primary,#111)}
input,button,select{font-family:inherit}</style>
</head><body><div id="root"></div><script src="./harness.js"></script></body></html>`);
console.log('✓ πάγκος εγγραφής');
