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
  // ΤΟ «process is not defined» ΕΡΙΧΝΕ ΟΛΟΚΛΗΡΗ ΤΗ ΣΚΗΝΗ, ΣΙΩΠΗΛΑ. Οταν μπήκε η
  // καρτέλα ενοικιαστή, ο πάγκος τράβηξε μαζί της modules που διαβάζουν
  // `process.env.NEXT_PUBLIC_SITE_URL` και `NEXT_PUBLIC_SUPABASE_URL`. Στον
  // περιηγητή το `process` δεν υπάρχει, οπότε η απόδοση έσκαγε πριν γράψει
  // τίποτα: η σκηνή έβγαινε ΚΕΝΗ και ο έλεγχος διάταξης «πράσινος», επειδή σε
  // κενή σελίδα δεν υπάρχει τίποτα κομμένο. Δηλώνονται όλες ρητά, με τιμές
  // πάγκου.
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_SITE_URL': '"https://example.invalid"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://example.invalid"',
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"anon"',
    'process.env.NEXT_PUBLIC_SENTRY_DSN': 'undefined',
    'process.env.NEXT_PUBLIC_BUILD_SHA': '"bench"',
    'process.env.NEXT_PUBLIC_INBOUND_DOMAIN': '"example.invalid"',
    'process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY': 'undefined',
    'process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION': 'undefined',
    // Ο,τι διαβάζει `process.env.X` για άγνωστο X, ή ρωτά `typeof process`.
    'process.env': 'BENCH_ENV',
  },
  inject: [join(here, 'bench-env.js')],
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
