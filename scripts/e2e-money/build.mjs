#!/usr/bin/env node
// Χτίζει τον πάγκο σε ΕΝΑ αρχείο, με ψευδώνυμο μόνο για τον πελάτη της βάσης.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(root, '.e2e-money');
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
    // ΤΟ ΜΟΝΟ ΨΕΥΤΙΚΟ ΚΟΜΜΑΤΙ. Ο,τι άλλο μπαίνει είναι ο κώδικας της παραγωγής.
    '@/lib/supabase/client': join(here, 'fakeClient.ts'),
    '@': root,
  },
});

// Οι μεταβλητές του θέματος, ώστε τα components να αποδίδουν με τα κανονικά
// τους μεγέθη. Δεν κρίνεται η εμφάνιση εδώ, αλλά ένα μηδενικό ύψος θα έκανε
// αδύνατο το πάτημα.
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const vars = (css.match(/:root\s*\{[\s\S]*?\}/) || [''])[0];

writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="el"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Πάγκος δοκιμών</title>
<style>${vars}
body{margin:0;font-family:system-ui,sans-serif;background:var(--bg-page,#fff);color:var(--text-primary,#111)}
.po-field,input,button,select{font-family:inherit}</style>
</head><body><script src="./harness.js"></script></body></html>`);

console.log('✓ ο πάγκος χτίστηκε στο .e2e-money');
