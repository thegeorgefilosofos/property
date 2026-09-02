// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΑΡΩΣΗ ΠΛΑΤΩΝ ΕΠΙ ΣΚΗΝΩΝ, ΓΡΑΜΜΕΝΗ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// Πέντε σαρωτές έγραφαν τον ΙΔΙΟ βρόχο: για κάθε πλάτος, για κάθε σκηνή,
// άνοιξε σελίδα, φόρτωσε τον πάγκο, περίμενε, ξεδίπλωσε τα πτυσσόμενα,
// ρώτησε το DOM, κλείσε. Οι διαφορές τους ήταν τρεις αριθμοί.
//
// ΤΟ ΚΟΣΤΟΣ ΤΗΣ ΕΠΑΝΑΛΗΨΗΣ ΤΟ ΠΛΗΡΩΣΑΜΕ ΜΕΤΡΗΤΟΙΣ. Οταν το CI άρχισε να
// ακυρώνεται στα είκοσι λεπτά, η διόρθωση —να τρέχουν τα πλάτη παράλληλα—
// έπρεπε να γραφτεί πέντε φορές, σε πέντε αρχεία, με πέντε ευκαιρίες να
// ξεχαστεί το ένα. Γράφεται εδώ μία φορά και την παίρνουν όλοι.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν κρίνει τίποτα. Το τι είναι εύρημα το ξέρει μόνο ο κάθε
// σαρωτής και μένει στο δικό του αρχείο· εδώ ζει μόνο η μετακίνηση.
// ═══════════════════════════════════════════════════════════════════════════
import { cpus } from 'node:os'
import { benchUrl } from './paths.mjs'

/**
 * ΟΙ ΘΕΣΕΙΣ ΕΙΝΑΙ ΟΣΟΙ ΟΙ ΠΥΡΗΝΕΣ, ΜΕ ΤΑΒΑΝΙ ΤΕΣΣΕΡΙΣ. Η απόδοση σελίδας είναι
 * δουλειά επεξεργαστή: περισσότερες παράλληλες σελίδες από πυρήνες τις κάνει
 * ΟΛΕΣ πιο αργές και προσθέτει και θόρυβο στις μετρήσεις χρόνου. Το E2E_LANES
 * υπάρχει για να μπορεί να γίνει 1 όταν χρειάζεται καθαρή σειρά εξόδου.
 */
export const laneCount = (jobs) =>
  Math.max(1, Math.min(Number(process.env.E2E_LANES || cpus().length), 4, jobs))

/**
 * Ανοίγει κάθε συνδυασμό πλάτους × σκηνής και δίνει τη σελίδα στον `visit`.
 *
 * @param {import('playwright-core').Browser} browser
 * @param {object} o
 * @param {(number|[number,number])[]} o.widths πλάτος, ή ζεύγος [πλάτος, ύψος]
 * @param {number|((w:number)=>number)} [o.height] ύψος όταν το πλάτος είναι σκέτο
 * @param {string[]} o.scenes
 * @param {string} [o.suffix] ό,τι κολλά στο URL του πάγκου, π.χ. '&noa=1'
 * @param {number} [o.settle] αναμονή μετά τη φόρτωση
 * @param {number} [o.passes] πόσες φορές ανοίγουν τα πτυσσόμενα
 * @param {number} [o.passWait] αναμονή μετά από κάθε πέρασμα
 * @param {number} [o.timeout] όριο φόρτωσης
 * @param {(page:any, at:{scene:string,width:number})=>Promise<any>} o.visit
 * @param {(err:Error, at:{scene:string,width:number})=>any} [o.onError]
 *        Οταν λείπει, η σκηνή που δεν φόρτωσε ΠΡΟΣΠΕΡΝΙΕΤΑΙ σιωπηλά: το λέει
 *        η σάρωση διάταξης, που ελέγχει ρητά για κενή σκηνή.
 * @returns {Promise<{scene:string,width:number,value:any}[]>}
 *        ΠΑΝΤΑ στη σειρά «πλάτος, μετά σκηνή» — όχι στη σειρά που τελείωσαν.
 *        Αλλιώς δύο εκτελέσεις πάνω στον ΙΔΙΟ κώδικα θα τύπωναν τα ίδια
 *        ευρήματα ανακατεμένα και η διαφορά δεν θα διαβαζόταν.
 */
export async function sweep(browser, o) {
  const heightAt = (w) =>
    typeof o.height === 'function' ? o.height(w) : (o.height ?? 1000)

  const jobs = []
  for (const spec of o.widths) {
    const [width, h] = Array.isArray(spec) ? spec : [spec, heightAt(spec)]
    for (const scene of o.scenes) jobs.push({ scene, width, height: h })
  }

  const results = new Array(jobs.length)
  let next = 0
  const lanes = laneCount(jobs.length)

  await Promise.all(Array.from({ length: lanes }, async () => {
    for (;;) {
      const i = next++
      if (i >= jobs.length) return
      const { scene, width, height } = jobs[i]
      const page = await browser.newPage({ viewport: { width, height } })
      try {
        await page.goto(benchUrl(scene) + (o.suffix || ''), { waitUntil: 'networkidle', timeout: o.timeout ?? 30000 })
        await page.waitForTimeout(o.settle ?? 350)
        // ΤΑ ΔΙΠΛΩΜΕΝΑ ΠΑΝΕΛ ΕΙΝΑΙ ΤΟ ΜΙΣΟ ΠΡΟΪΟΝ. Το πάνελ έγκρισης, η ανάλυση
        // ESIS και ο προϋπολογισμός ανά κατηγορία ζουν πίσω από πτυσσόμενη
        // ενότητα: χωρίς άνοιγμα, ο σαρωτής έβγαζε καθαρή σκηνή για οθόνη που
        // δεν είχε δει. Πάνω από ένα πέρασμα, γιατί ενότητα κρύβει ενότητα.
        for (let pass = 0; pass < (o.passes ?? 0); pass++) {
          await page.evaluate(() => {
            for (const b of document.querySelectorAll('[aria-expanded="false"]')) (b instanceof HTMLElement) && b.click()
          })
          await page.waitForTimeout(o.passWait ?? 400)
        }
        results[i] = { scene, width, value: await o.visit(page, { scene, width }) }
      } catch (err) {
        if (o.onError) results[i] = { scene, width, value: o.onError(err, { scene, width }) }
      }
      await page.close()
    }
  }))

  return results.filter(Boolean)
}
