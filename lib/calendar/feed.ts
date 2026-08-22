// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΠΡΟΘΕΣΜΙΕΣ, ΣΤΟ ΗΜΕΡΟΛΟΓΙΟ ΠΟΥ ΗΔΗ ΚΟΙΤΑΖΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ. Η εφαρμογή ξέρει πότε λήγει ο λογαριασμός, πότε μπαίνει το
// ενοίκιο, πότε λήγει η ασφάλεια. Και τα λέει ΜΟΝΟ σε όποιον την ανοίξει. Ο
// άνθρωπος όμως δεν ζει εδώ: ζει στο ημερολόγιο του κινητού του, εκεί που
// χτυπά η ειδοποίηση της οδοντιατρικής επίσκεψης.
//
// Ο ΜΗΧΑΝΙΣΜΟΣ ΥΠΗΡΧΕ ΗΔΗ, ΑΝΤΙΣΤΡΟΦΑ. Η εφαρμογή ΔΙΑΒΑΖΕΙ ημερολόγια iCal
// από Airbnb και Booking για τις διαμονές. Το ίδιο πρωτόκολλο, προς την άλλη
// κατεύθυνση, βάζει τις προθεσμίες στο Google Calendar ή στο Ημερολόγιο του
// iPhone — μία φορά, και ενημερώνονται μόνες τους.
//
// ── ΤΡΕΙΣ ΑΠΟΦΑΣΕΙΣ ──────────────────────────────────────────────────────
//
// ΟΛΟΗΜΕΡΑ ΓΕΓΟΝΟΤΑ, ΟΧΙ ΩΡΕΣ. Μια προθεσμία δεν έχει ώρα: το «λήγει στις 20
// Αυγούστου» δεν σημαίνει «στις 09:00». Ενα γεγονός με ώρα θα εμφανιζόταν
// μέσα στη μέρα, ανάμεσα σε ραντεβού, και θα μετακινούνταν με τη ζώνη ώρας.
//
// ΤΟ UID ΕΙΝΑΙ ΣΤΑΘΕΡΟ. Ο ίδιος λογαριασμός πρέπει να δίνει το ΙΔΙΟ uid σε
// κάθε ανανέωση, αλλιώς κάθε συγχρονισμός σβήνει και ξαναγράφει τα πάντα: ο
// χρήστης χάνει ό,τι σημείωσε πάνω τους, και οι ειδοποιήσεις ξαναχτυπούν.
//
// ΤΙΠΟΤΑ ΔΕΝ ΕΦΕΥΡΙΣΚΕΤΑΙ. Γεγονός χωρίς ημερομηνία ή χωρίς τίτλο ΔΕΝ μπαίνει:
// ένα «(χωρίς τίτλο)» στο ημερολόγιο κάποιου είναι θόρυβος που θα τον κάνει να
// διαγράψει ολόκληρη τη συνδρομή.
// ═══════════════════════════════════════════════════════════════════════════

import { escapeIcsText, icsBody, compactDay, nextDayCompact, icsStamp } from './ics';

/** Ενα γεγονός του ημερολογίου, όπως φεύγει προς τα έξω. */
export interface FeedItem {
  /** Σταθερό ανά αντικείμενο: ίδιο σε κάθε ανανέωση της συνδρομής. */
  uid: string;
  /** Η ημέρα, «YYYY-MM-DD». */
  date: string;
  title: string;
  note?: string | null;
}

export interface FeedOptions {
  /** Το όνομα που δείχνει το ημερολόγιο στη λίστα του χρήστη. */
  name: string;
  now: Date;
  /** Κάθε πόσες ώρες προτείνουμε ανανέωση. */
  ttlHours?: number;
}

/** Η προεπιλογή ανανέωσης: δύο φορές την ημέρα φτάνει για προθεσμίες. */
export const DEFAULT_TTL_HOURS = 12;

const clean = (v: string | null | undefined): string => String(v ?? '').trim();

/**
 * Το ημερολόγιο, έτοιμο να σερβιριστεί.
 *
 * Επιστρέφει ΠΑΝΤΑ έγκυρο ημερολόγιο, ακόμη και άδειο: μια συνδρομή που
 * απαντά «τίποτα προς το παρόν» είναι σωστή· μια που απαντά σφάλμα, ο πελάτης
 * την πετάει μετά από λίγες αποτυχίες.
 */
export function buildCalendarFeed(items: readonly FeedItem[], o: FeedOptions): string {
  const stamp = icsStamp(o.now);
  const ttl = `PT${Math.max(1, Math.round(o.ttlHours ?? DEFAULT_TTL_HOURS))}H`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Property OS//Προθεσμίες//EL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(o.name)}`,
    'X-WR-TIMEZONE:Europe/Athens',
    // Οι δύο γραμμές λένε το ίδιο σε δύο οικογένειες πελατών: η πρώτη είναι του
    // προτύπου, η δεύτερη αυτή που διαβάζουν Google και Outlook.
    `REFRESH-INTERVAL;VALUE=DURATION:${ttl}`,
    `X-PUBLISHED-TTL:${ttl}`,
  ];

  const seen = new Set<string>();
  for (const it of items) {
    const start = compactDay(it.date);
    const title = clean(it.title);
    const uid = clean(it.uid);
    if (!start || !title || !uid || seen.has(uid)) continue;
    seen.add(uid);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${nextDayCompact(it.date)}`,
      `SUMMARY:${escapeIcsText(title)}`,
    );
    const note = clean(it.note);
    if (note) lines.push(`DESCRIPTION:${escapeIcsText(note)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return icsBody(lines);
}
