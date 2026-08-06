#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// E2E ΣΕΝΑΡΙΑ ΓΙΑ ΤΑ ΔΗΜΟΣΙΑ ΕΡΓΑΛΕΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Οδηγεί τον πραγματικό browser πάνω στις δύο δωρεάν σελίδες, όπως θα τις
// χρησιμοποιούσε επισκέπτης: γράφει στα πεδία, αλλάζει επιλογές, και ελέγχει
// ότι ο αριθμός στην οθόνη είναι ΑΚΡΙΒΩΣ ο αναμενόμενος — υπολογισμένος στο χέρι.
//
// ΓΙΑΤΙ ΔΕΝ ΦΤΑΝΟΥΝ ΤΑ UNIT ΤΕΣΤ
// Το lib/billing/publicTools.test.ts ελέγχει τη ΣΥΝΘΕΣΗ των υπολογισμών. Δεν
// μπορεί όμως να πιάσει: πεδίο χωρίς ετικέτα, οριζόντια υπερχείλιση σε κινητό,
// NaN που φτάνει στην οθόνη, ή —το χειρότερο— middleware που ανακατευθύνει τη
// δωρεάν σελίδα σε σύνδεση. Το τελευταίο συνέβη ΠΡΑΓΜΑΤΙΚΑ: το build περνούσε
// καθαρό και η σελίδα γύριζε HTTP 307.
//
// ΔΕΝ ΤΡΕΧΕΙ ΣΤΟ CI: χρειάζεται ζωντανό server και browser. Τρέξε τοπικά:
//     npm run dev            (σε άλλο τερματικό)
//     node scripts/e2e-public-tools.mjs
//
// Χρειάζεται playwright-core (devDependency κατ' απαίτηση):
//     npm i -D playwright-core
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg
const B = process.env.E2E_BASE || 'http://localhost:3000'
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] })
let pass=0, fail=0
const ok=(n,c)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+n) } }

async function page(ctx, path){ const p=await ctx.newPage(); await p.goto(B+path,{waitUntil:'networkidle'});
  await p.getByRole('button',{name:/κατάλαβα/i}).click().catch(()=>{}); await p.waitForTimeout(300); return p }
const num = t => Number(String(t).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))

// ── ΦΟΡΟΣ ΕΝΟΙΚΙΩΝ, σαν χρήστης ────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport:{width:1280,height:1000}, locale:'el-GR' })
  const p = await page(ctx,'/ypologismos-forou-enoikion')
  const inputs = p.locator('input')
  const read = async () => {
    const txt = await p.locator('body').innerText()
    const m = txt.match(/ΦΟΡΟΣ\s*\n\s*([\d.,]+)\s*€/); return m ? num(m[1]) : null
  }
  ok('αρχική κατάσταση δείχνει 1.026 € (600×12)', await read() === 1026)

  await inputs.nth(0).fill('1200'); await p.waitForTimeout(250)
  ok('1.200 €/μήνα → 2.220 € (δύο κλιμάκια)', await read() === 2220)

  await inputs.nth(1).fill('6'); await p.waitForTimeout(250)
  ok('…και για 6 μήνες → 1.026 € (ίδιο ετήσιο)', await read() === 1026)

  await inputs.nth(0).fill('0'); await p.waitForTimeout(250)
  ok('μηδενικό ενοίκιο → 0 €', await read() === 0)

  await inputs.nth(0).fill('δεν ξέρω'); await p.waitForTimeout(250)
  const junk = await read()
  ok('σκουπίδια στο πεδίο δεν σπάνε τη σελίδα', junk === 0)
  ok('…και δεν εμφανίζεται NaN', !(await p.locator('body').innerText()).includes('NaN'))

  // Ρητά ΚΑΙ τα δύο πεδία: το πεδίο μηνών είχε μείνει στο 6 από το προηγούμενο
  // βήμα και η πρώτη εκδοχή αυτού του ελέγχου απέτυχε γι' αυτόν τον λόγο.
  // 1.250,50 × 12 = 15.006 · φορολογητέο 14.255,70
  // φόρος = 12.000×15% + 2.255,70×25% = 1.800 + 563,93 = 2.363,93
  await inputs.nth(0).fill('1.250,50'); await inputs.nth(1).fill('12'); await p.waitForTimeout(300)
  ok('ελληνική γραφή «1.250,50» → 2.363,93 €', Math.abs((await read()) - 2363.93) < 0.02)

  ok('υπάρχει σύνδεσμος εγγραφής', await p.locator('a[href="/signup"]').count() > 0)
  await ctx.close()
}

// ── ΕΝΦΙΑ, σαν χρήστης ─────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport:{width:1280,height:1000}, locale:'el-GR' })
  const p = await page(ctx,'/ypologismos-enfia')
  const read = async () => {
    const txt = await p.locator('body').innerText()
    const m = txt.match(/ΕΝΦΙΑ ΕΤΗΣΙΩΣ\s*\n\s*([\d.,]+)\s*€/); return m ? num(m[1]) : null
  }
  ok('αρχική κατάσταση δείχνει 180,28 € (85τμ, ζώνη 1400)', Math.abs((await read()) - 180.28) < 0.02)

  const inputs = p.locator('input')
  await inputs.nth(0).fill('120'); await inputs.nth(1).fill('3200')
  await p.locator('select').nth(0).selectOption('ground')
  // ΤΟ ΚΛΕΙΔΙ ΑΛΛΑΞΕ ΟΤΑΝ Η ΚΛΙΜΑΚΑ ΠΗΡΕ ΤΗΝ ΕΚΤΗ ΖΩΝΗ. Ο νόμος έχει ΕΞΙ ζώνες
  // παλαιότητας· ο κώδικας είχε πέντε και χρέωνε τα κτίρια 15 ως 19 ετών με τον
  // συντελεστή της προηγούμενης ζώνης. Με τη διόρθωση, τα κλειδιά έγιναν
  // y0_4 … y26_plus. Το σενάριο εδώ ζητούσε ακόμη το παλιό «under_5»: η επιλογή
  // δεν υπήρχε πια στο DOM και το σενάριο κρεμούσε τριάντα δευτερόλεπτα, χωρίς
  // να πει ΓΙΑΤΙ. Ο συντελεστής (1,25) είναι ο ίδιος, άρα και το αναμενόμενο ποσό.
  await p.locator('select').nth(1).selectOption('y0_4')
  await p.waitForTimeout(300)
  ok('120τμ / ζώνη 3200 / ισόγειο / νεόδμητο → 1.026 €', Math.abs((await read()) - 1026) < 0.02)

  await inputs.nth(2).fill('50'); await p.waitForTimeout(300)
  const half = await read()
  ok('50% ιδιοκτησία μειώνει το ποσό', half < 1026)

  await inputs.nth(1).fill('0'); await p.waitForTimeout(300)
  const txt = await p.locator('body').innerText()
  ok('χωρίς τιμή ζώνης δεν δείχνει ψεύτικο αποτέλεσμα', txt.includes('Συμπλήρωσε'))
  ok('πουθενά NaN', !txt.includes('NaN'))
  ok('υπάρχει σύνδεσμος προς τον άλλο υπολογιστή',
     await p.locator('a[href="/ypologismos-forou-enoikion"]').count() > 0)
  await ctx.close()
}

// ── Προσβασιμότητα & responsive και στα δύο ───────────────────────────────
for (const path of ['/ypologismos-forou-enoikion','/ypologismos-enfia']) {
  for (const w of [360, 390, 768, 1440]) {
    const ctx = await b.newContext({ viewport:{width:w,height:900}, locale:'el-GR', isMobile:w<700 })
    const p = await page(ctx, path)
    const m = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      unlabelled: [...document.querySelectorAll('input,select')].filter(el =>
        !el.getAttribute('aria-label') && !document.querySelector(`label[for="${el.id}"]`)).length,
      h1: document.querySelectorAll('h1').length,
      jsonld: document.querySelectorAll('script[type="application/ld+json"]').length,
    }))
    ok(`${path} @${w}: χωρίς οριζόντια υπερχείλιση`, !m.overflow)
    ok(`${path} @${w}: κάθε πεδίο έχει ετικέτα`, m.unlabelled === 0)
    if (w===1440){ ok(`${path}: ακριβώς ένα h1`, m.h1===1); ok(`${path}: δομημένο σχήμα`, m.jsonld===1) }
    await ctx.close()
  }
}

// ── Το middleware δεν ζητά σύνδεση ────────────────────────────────────────
for (const path of ['/ypologismos-forou-enoikion','/ypologismos-enfia']) {
  const res = await fetch(B+path, { redirect:'manual' })
  ok(`${path}: δημόσιο (HTTP ${res.status})`, res.status === 200)
}

console.log(`\nE2E: ${pass} passed, ${fail} failed`)
await b.close()
process.exit(fail?1:0)
