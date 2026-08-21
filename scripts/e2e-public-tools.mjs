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

  // ── Η ΧΡΟΝΙΑ ΤΟΥ ΕΙΣΟΔΗΜΑΤΟΣ ΑΛΛΑΖΕΙ ΤΗΝ ΚΛΙΜΑΚΑ, ΚΑΙ Ο ΕΛΕΓΧΟΣ ΤΟ ΞΕΧΝΟΥΣΕ
  // Οι δύο επόμενοι έλεγχοι περίμεναν τα νούμερα του 2026 (15/25/35/45) ενώ η
  // σελίδα ξεκινά στο 2025 (15/35/45) — από τότε που προστέθηκε ο επιλογέας
  // χρονιάς. Δεν ήταν σφάλμα της σελίδας: ήταν έλεγχος που είχε μείνει πίσω και
  // κατηγορούσε σωστό κώδικα. Τώρα διαλέγει ΡΗΤΑ χρονιά και ελέγχει ΚΑΙ ΤΙΣ ΔΥΟ
  // κλίμακες, που είναι και το πιο επικίνδυνο σημείο του υπολογιστή.
  const year = async y => { await p.getByRole('button', { name: new RegExp('^' + y) }).click(); await p.waitForTimeout(250) }

  await inputs.nth(0).fill('1200'); await p.waitForTimeout(250)
  // 1.200 × 12 = 14.400 · φορολογητέο 13.680
  //   2025: 12.000×15% + 1.680×35% = 1.800 + 588 = 2.388
  //   2026: 12.000×15% + 1.680×25% = 1.800 + 420 = 2.220
  ok('1.200 €/μήνα με την κλίμακα 2025 → 2.388 €', await read() === 2388)
  await year(2026)
  ok('…και με την κλίμακα 2026 → 2.220 € (το ενδιάμεσο 25%)', await read() === 2220)
  await year(2025)

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
  //   2025: 12.000×15% + 2.255,70×35% = 1.800 + 789,50 = 2.589,50
  //   2026: 12.000×15% + 2.255,70×25% = 1.800 + 563,93 = 2.363,93
  await inputs.nth(0).fill('1.250,50'); await inputs.nth(1).fill('12'); await p.waitForTimeout(300)
  ok('ελληνική γραφή «1.250,50» → 2.589,50 € (κλίμακα 2025)', Math.abs((await read()) - 2589.50) < 0.02)
  await year(2026)
  ok('…και 2.363,93 € με την κλίμακα 2026', Math.abs((await read()) - 2363.93) < 0.02)

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
  // ΤΑ ΝΤΟΠΙΑ <select> ΕΦΥΓΑΝ ΑΠΟ ΟΛΗ ΤΗΝ ΕΦΑΡΜΟΓΗ: το λειτουργικό ζωγράφιζε τη
  // λίστα με δικά του χρώματα μέσα σε οθόνη με δικό της σύστημα πεδίων. Εδώ
  // οδηγείται πλέον το CustomSelect — άνοιγμα του combobox, κλικ στην επιλογή —
  // δηλαδή ακριβώς ό,τι κάνει ο χρήστης, με την ετικέτα και όχι με το κλειδί.
  const pick = async (i, optionLabel) => {
    await p.locator('[role="combobox"]').nth(i).click()
    await p.locator('[role="option"]', { hasText: optionLabel }).first().click()
    await p.waitForTimeout(150)
  }
  await pick(0, 'Ισόγειο')
  // ΤΟ ΚΛΕΙΔΙ ΑΛΛΑΞΕ ΟΤΑΝ Η ΚΛΙΜΑΚΑ ΠΗΡΕ ΤΗΝ ΕΚΤΗ ΖΩΝΗ. Ο νόμος έχει ΕΞΙ ζώνες
  // παλαιότητας· ο κώδικας είχε πέντε και χρέωνε τα κτίρια 15 ως 19 ετών με τον
  // συντελεστή της προηγούμενης ζώνης. Ο συντελεστής της πρώτης ζώνης (1,25)
  // δεν άλλαξε, άρα ούτε το αναμενόμενο ποσό.
  await pick(1, 'Έως 4 έτη')
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

// ── ΚΑΘΑΡΗ ΑΠΟΔΟΣΗ, σαν χρήστης ───────────────────────────────────────────
// Ο τέταρτος υπολογιστής είναι ο μόνος που βγάζει ΠΟΣΟΣΤΟ, και το ποσοστό
// είναι το πιο εύκολο νούμερο να βγει λάθος χωρίς να φανεί: ένα 3,60% και ένα
// 4,20% μοιάζουν και τα δύο εύλογα. Ελέγχονται και τα δύο, από τον browser.
{
  const ctx = await b.newContext({ viewport:{width:1280,height:1100}, locale:'el-GR' })
  const p = await page(ctx,'/kathari-apodosi')
  const pct = async label => {
    const txt = await p.locator('body').innerText()
    const m = txt.match(new RegExp(label + '\\s*\\n\\s*([\\d.,]+)\\s*%'))
    return m ? num(m[1]) : null
  }
  const eur = async label => {
    const txt = await p.locator('body').innerText()
    const m = txt.match(new RegExp(label + '\\s+([\\d.,]+)\\s*€'))
    return m ? num(m[1]) : null
  }

  // Προεπιλογές: αξία 200.000, ενοίκιο 700, 12 μήνες, χωρίς ΕΝΦΙΑ και δαπάνες.
  // ακαθάριστο 8.400 · φορολογητέο 7.980 · φόρος 1.197 · καθαρά 7.203
  // μεικτή 4,20% · καθαρή 3,6015%
  ok('η μεικτή απόδοση ξεκινά στο 4,20%', Math.abs((await pct('ΜΕΙΚΤΗ ΑΠΟΔΟΣΗ')) - 4.20) < 0.01)
  ok('η καθαρή ξεκινά στο 3,60%', Math.abs((await pct('ΚΑΘΑΡΗ ΑΠΟΔΟΣΗ')) - 3.60) < 0.01)
  ok('και ο φόρος είναι 1.197,00 €', Math.abs((await eur('Φόρος εισοδήματος')) - 1197) < 0.02)

  // ── ΤΟ ΣΗΜΕΙΟ ΠΟΥ ΚΑΝΕΝΑΣ ΑΛΛΟΣ ΔΕΝ ΚΑΝΕΙ ΣΩΣΤΑ ────────────────────────
  // Με άλλα 20.000 € ενοίκια, ο φόρος ΤΟΥ ΑΚΙΝΗΤΟΥ ανεβαίνει σε 2.293 €:
  // 26.980 φορολογητέο συνολικά μείον 19.000 χωρίς αυτό.
  const inputs = p.locator('input')
  await inputs.nth(5).fill('20000'); await p.waitForTimeout(300)
  ok('τα άλλα ενοίκια ανεβάζουν τον φόρο στα 2.293,00 €', Math.abs((await eur('Φόρος εισοδήματος')) - 2293) < 0.02)
  // καθαρά 8.400 − 2.293 = 6.107 · 6.107 / 200.000 = 3,0535%
  ok('και η καθαρή απόδοση πέφτει από 3,60% σε 3,05%', Math.abs((await pct('ΚΑΘΑΡΗ ΑΠΟΔΟΣΗ')) - 3.05) < 0.01)
  ok('η μεικτή δεν αλλάζει, γιατί δεν ξέρει τίποτα', Math.abs((await pct('ΜΕΙΚΤΗ ΑΠΟΔΟΣΗ')) - 4.20) < 0.01)
  await inputs.nth(5).fill('0'); await p.waitForTimeout(250)

  // ── ΧΩΡΙΣ ΑΞΙΑ ΔΕΝ ΓΡΑΦΕΤΑΙ ΠΟΣΟΣΤΟ ────────────────────────────────────
  await inputs.nth(0).fill('0'); await p.waitForTimeout(300)
  const body0 = await p.locator('body').innerText()
  ok('χωρίς αξία δεν εμφανίζεται απόδοση', !body0.includes('ΚΑΘΑΡΗ ΑΠΟΔΟΣΗ'))
  ok('…και δεν εμφανίζεται Infinity ή NaN', !/Infinity|NaN/.test(body0))
  await inputs.nth(0).fill('200000'); await p.waitForTimeout(250)

  // ── ΣΚΟΥΠΙΔΙΑ ΣΤΟ ΠΕΔΙΟ ────────────────────────────────────────────────
  await inputs.nth(1).fill('δεν ξέρω'); await p.waitForTimeout(300)
  const bodyJunk = await p.locator('body').innerText()
  ok('σκουπίδια δεν σπάνε τη σελίδα', !/Infinity|NaN/.test(bodyJunk))
  ok('και το ακίνητο που δεν αποδίδει δεν βγάζει αρνητικά χρόνια', bodyJunk.includes('Δεν επιστρέφει'))

  ok('υπάρχει σύνδεσμος εγγραφής', await p.locator('a[href="/signup"]').count() > 0)
  await ctx.close()
}

// ── Προσβασιμότητα & responsive και στα δύο ───────────────────────────────
for (const path of ['/ypologismos-forou-enoikion','/ypologismos-enfia','/kathari-apodosi','/vraxyxronia-i-makroxronia']) {
  for (const w of [360, 390, 768, 1440]) {
    const ctx = await b.newContext({ viewport:{width:w,height:900}, locale:'el-GR', isMobile:w<700 })
    const p = await page(ctx, path)
    const m = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      // Μαζί με τα input, ελέγχονται και τα combobox του CustomSelect: όταν τα
      // ντόπια <select> έφυγαν, ο έλεγχος προσβασιμότητας θα σταματούσε σιωπηλά
      // να κοιτάζει πεδία επιλογής — δηλαδή θα περνούσε επειδή δεν βρίσκει τίποτα.
      unlabelled: [...document.querySelectorAll('input,select,[role="combobox"]')].filter(el =>
        !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')
        && !document.querySelector(`label[for="${el.id}"]`)).length,
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
for (const path of ['/ypologismos-forou-enoikion','/ypologismos-enfia','/kathari-apodosi','/vraxyxronia-i-makroxronia']) {
  const res = await fetch(B+path, { redirect:'manual' })
  ok(`${path}: δημόσιο (HTTP ${res.status})`, res.status === 200)
}

console.log(`\nE2E: ${pass} passed, ${fail} failed`)
await b.close()
process.exit(fail?1:0)
