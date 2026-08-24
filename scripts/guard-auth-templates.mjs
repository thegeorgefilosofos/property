#!/usr/bin/env node
// Τα πρότυπα ταυτότητας της Supabase δεν αποκλίνουν από το κέλυφος που τα
// γέννησε. Η λογική ζει ΜΙΑ φορά, στη γεννήτρια· εδώ τρέχει με «--check».
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΤΟ ΓΕΝΝΗΣΕ (24/08/2026). Η επιβεβαίωση διεύθυνσης έφευγε με τα
// εργοστασιακά πρότυπα της Supabase: αγγλικό «Confirm your email address» από
// «noreply@mail.app.supabase.io». Είναι το ΜΟΝΟ email που παίρνει κάθε χρήστης,
// και ήταν το μόνο που δεν είχαμε γράψει. Οταν γράφτηκε, έπρεπε να μη μπορεί
// να ξεχαστεί στην επόμενη αλλαγή χρώματος.
import { spawnSync } from 'node:child_process'

const r = spawnSync('npx', ['tsx', 'scripts/build-auth-templates.ts', '--check'], {
  encoding: 'utf8', stdio: 'inherit',
})
process.exit(r.status ?? 1)
