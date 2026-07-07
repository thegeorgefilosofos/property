// Αυστηρά τεστ για την ασφαλή επωνυμία αναφορών (reportBranding.ts).
// Τρέξε: npx tsx lib/reportBranding.test.ts
import { sanitizeAccent, sanitizeLogo, reportAccent, brandName, DEFAULT_ACCENT } from './reportBranding';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name); } };

// ── sanitizeAccent: μόνο έγκυρο 6ψήφιο hex περνά ─────────────────────────────
ok('accent uppercase hex', sanitizeAccent('#1A73E8') === '#1A73E8');
ok('accent lowercase hex', sanitizeAccent('#abcdef') === '#abcdef');
ok('accent named color → default', sanitizeAccent('red') === DEFAULT_ACCENT);
ok('accent 3-digit → default', sanitizeAccent('#fff') === DEFAULT_ACCENT);
ok('accent CSS injection → default', sanitizeAccent('#1a73e8;}body{x') === DEFAULT_ACCENT);
ok('accent undefined → default', sanitizeAccent(undefined) === DEFAULT_ACCENT);
ok('accent null → default', sanitizeAccent(null) === DEFAULT_ACCENT);
ok('accent empty → default', sanitizeAccent('') === DEFAULT_ACCENT);

// ── sanitizeLogo: μόνο raster data-URL περνά ─────────────────────────────────
ok('logo valid png', sanitizeLogo('data:image/png;base64,iVBORw0KGgo=') === 'data:image/png;base64,iVBORw0KGgo=');
ok('logo valid jpeg', sanitizeLogo('data:image/jpeg;base64,/9j/4AAQ=') === 'data:image/jpeg;base64,/9j/4AAQ=');
ok('logo svg rejected', sanitizeLogo('data:image/svg+xml;base64,PHN2Zz4=') === '');
ok('logo http rejected', sanitizeLogo('https://evil.example/x.png') === '');
ok('logo javascript rejected', sanitizeLogo('javascript:alert(1)') === '');
ok('logo oversized rejected', sanitizeLogo('data:image/png;base64,' + 'A'.repeat(700001)) === '');
ok('logo empty', sanitizeLogo('') === '');
ok('logo null', sanitizeLogo(null) === '');

// ── reportAccent ─────────────────────────────────────────────────────────────
ok('reportAccent null → default', reportAccent(null) === DEFAULT_ACCENT);
ok('reportAccent valid', reportAccent({ enabled: true, accentColor: '#000000', companyName: '', logoUrl: '', phone: '', email: '' }) === '#000000');
ok('reportAccent bad → default', reportAccent({ enabled: true, accentColor: 'bad', companyName: '', logoUrl: '', phone: '', email: '' }) === DEFAULT_ACCENT);

// ── brandName: escaped ή fallback ────────────────────────────────────────────
ok('brandName null → Property OS', brandName(null) === 'Property OS');
ok('brandName escapes html', brandName({ enabled: true, companyName: 'Α&Β <Real> Estate', logoUrl: '', accentColor: '', phone: '', email: '' }) === 'Α&amp;Β &lt;Real&gt; Estate');
ok('brandName trims empty → fallback', brandName({ enabled: true, companyName: '   ', logoUrl: '', accentColor: '', phone: '', email: '' }) === 'Property OS');

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nreportBranding.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
