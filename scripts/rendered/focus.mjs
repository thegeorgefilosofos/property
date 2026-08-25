// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΣΤΙΑΣΗ ΚΡΙΝΕΤΑΙ ΣΕ ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ, ΟΧΙ ΣΕ ΙΔΙΟΤΗΤΕΣ CSS
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΟΧΙ ΜΕ ΕΛΕΓΧΟ ΙΔΙΟΤΗΤΩΝ. Δοκιμάστηκε: κοιτάζοντας outline και
// box-shadow ΤΟΥ ΙΔΙΟΥ του στοιχείου, ο έλεγχος ανέφερε οκτώ πεδία ως
// «αόρατα». Ολα τους δήλωναν την εστίαση αλλιώς — με χρώμα περιγράμματος, ή
// από το περίβλημά τους με :focus-within. Οκτώ ψεύτικα ευρήματα, και μια
// ολόκληρη ώρα να αποδειχθεί ότι ο κώδικας ήταν σωστός.
//
// Η ΣΥΓΚΡΙΣΗ ΕΙΝΑΙ ΑΥΣΤΗΡΟΤΕΡΗ ΑΠΟ ΟΣΟ ΦΑΙΝΕΤΑΙ, ΚΑΙ ΧΩΡΙΣ ΕΞΑΡΤΗΣΗ. Δεν
// μετριέται «πόσο» άλλαξε η εικόνα αλλά «αν» άλλαξε καθόλου: το Chromium
// κωδικοποιεί ντετερμινιστικά, άρα ίδια εικονοστοιχεία δίνουν ίδια byte.
// Επαληθευμένο με μηδενική υπόθεση: δύο φωτογραφίες του ίδιου πράγματος
// βγαίνουν ΤΑΥΤΟΣΗΜΕΣ. Η αδυναμία δηλώνεται: αλλαγή ενός εικονοστοιχείου θα
// περνούσε, οπότε το μηδέν εδώ σημαίνει «πουθενά τελείως αόρατο», όχι «ορατό
// δαχτυλίδι παντού».
//
// Ο ΔΡΟΜΕΑΣ ΚΕΙΜΕΝΟΥ ΝΟΘΕΥΕΙ ΤΗ ΜΕΤΡΗΣΗ και σβήνεται: μια λεπτή γραμμή που
// αναβοσβήνει δεν είναι δείκτης εστίασης — δεν φαίνεται από απόσταση, δεν
// υπάρχει σε select ή σε κουμπί, και λείπει τη μισή ώρα.
// ═══════════════════════════════════════════════════════════════════════════
export const NO_CARET = '* { caret-color: transparent !important; }';

export const FOCUSABLE =
  'input:not([type=hidden]), select, textarea, [tabindex="0"], [role="checkbox"], [role="button"][tabindex]';

/**
 * Μετρά ένα στοιχείο. Επιστρέφει `null` όταν δεν αξίζει να μετρηθεί.
 *
 * @param focus αν false, ΔΕΝ εστιάζεται τίποτα: η μετάλλαξη που αποδεικνύει
 *              ότι ο έλεγχος μπορεί να κοκκινίσει.
 */
export async function measureFocus(page, handle, { focus = true } = {}) {
  const ok = await handle.evaluate(el => el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })
    && el.getBoundingClientRect().width > 6 && el.getBoundingClientRect().height > 6);
  if (!ok) return null;
  await handle.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(60);
  const box = await handle.boundingBox();
  if (!box) return null;
  // Λίγος αέρας γύρω, ώστε να πιαστεί και δαχτυλίδι που κάθεται απ' έξω.
  const vp = page.viewportSize();
  const clip = {
    x: Math.max(0, box.x - 7), y: Math.max(0, box.y - 7),
    width: Math.min(box.width + 14, vp.width - Math.max(0, box.x - 7)),
    height: Math.min(box.height + 14, vp.height - Math.max(0, box.y - 7)),
  };
  if (clip.width < 2 || clip.height < 2) return null;
  const before = await page.screenshot({ clip });
  if (focus) await handle.evaluate(el => el.focus({ focusVisible: true }));
  await page.waitForTimeout(140);
  const after = await page.screenshot({ clip });
  await handle.evaluate(el => el.blur && el.blur());
  const invisible = before.length === after.length && before.equals(after);
  if (!invisible) return null;
  return handle.evaluate(el => {
    const c = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '';
    const name = el.getAttribute('aria-label') || el.placeholder || (el.textContent || '').trim();
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}${el.type ? '[' + el.type + ']' : ''} «${name.slice(0, 24)}»`;
  });
}
