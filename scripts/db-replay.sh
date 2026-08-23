#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  ΤΡΕΧΕΙ ΟΛΕΣ ΤΙΣ ΜΕΤΑΝΑΣΤΕΥΣΕΙΣ ΣΕ ΠΡΑΓΜΑΤΙΚΟ POSTGRES
# ─────────────────────────────────────────────────────────────────────────
#  ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Το αποθετήριο έχει σαράντα έξι φύλακες που ΔΙΑΒΑΖΟΥΝ
#  το SQL — ελέγχουν ονόματα στηλών, πολιτικές RLS, search_path, ανάποδες
#  αναφορές. Κανένας δεν το ΕΚΤΕΛΕΙ. Μια μετανάστευση με συντακτικό λάθος, με
#  στήλη που δεν υπάρχει ή με συνάρτηση που καλείται πριν οριστεί περνούσε το
#  CI ολόκληρο και έσκαγε στην παραγωγή, τη στιγμή του `db push`.
#
#  ΤΙ ΚΑΝΕΙ. Στήνει τοπική βάση, βάζει τη σκαλωσιά της πλατφόρμας (auth,
#  storage, vault, cron — όσα δίνει το Supabase και δεν υπάρχουν σε γυμνό
#  Postgres), και τρέχει ΚΑΘΕ μετανάστευση με τη σειρά. Μία αποτυχία, ένα
#  κόκκινο.
#
#  ΚΑΙ ΕΛΕΓΧΕΙ ΤΗΝ ΑΠΟΜΟΝΩΣΗ. Έγραφε εδώ, τίμια, «δεν ελέγχει συμπεριφορά RLS».
#  Πέντε φύλακες διαβάζουν τις πολιτικές ως ΚΕΙΜΕΝΟ· κανένας δεν ρωτούσε το
#  ίδιο το Postgres «βλέπει ο Α τα δεδομένα του Β;», που για SaaS πολλών
#  πελατών είναι Η ερώτηση. Το scripts/db/rls-probe.sql αλλάζει ρόλο σε
#  `authenticated`, ρωτά τη βάση σαν χρήστης, και απαιτεί άρνηση σε κάθε ξένη
#  γραμμή. Χωρίς αυτό, καμία αλλαγή δικαιωμάτων δεν μπορεί να αποδειχθεί.
#
#  ΟΙ ΤΕΣΣΕΡΙΣ ΕΠΕΚΤΑΣΕΙΣ ΤΗΣ ΠΛΑΤΦΟΡΜΑΣ (pg_cron, pg_net, pg_stat_statements,
#  supabase_vault) σχολιάζονται στο τοπικό αντίγραφο: δεν υπάρχουν ως αρχεία
#  .so εδώ. Τα ΣΧΗΜΑΤΑ τους στήνονται από τη σκαλωσιά, ώστε ό,τι τα καλεί να
#  ελέγχεται κανονικά.
#
#  ΧΡΗΣΗ:  bash scripts/db-replay.sh
#  Απαιτεί: postgresql-16 εγκατεστημένο τοπικά (initdb, pg_ctl, psql).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── ΚΑΘΕ ΤΡΕΞΙΜΟ ΕΧΕΙ ΔΙΚΗ ΤΟΥ ΠΟΡΤΑ ΚΑΙ ΔΙΚΗ ΤΟΥ ΠΡΙΖΑ ────────────────────
# Η πόρτα ήταν καρφωμένη στο 5433 και η πρίζα του Unix στο /tmp — δηλαδή δύο
# σταθερά ονόματα, κοινά για όλα τα τρεξίματα. Ενα τρέξιμο που σκοτώθηκε
# απότομα (Ctrl-C, timeout, kill) άφηνε πίσω του ζωντανό διακομιστή· το επόμενο
# έβρισκε την πόρτα πιασμένη, έγραφε «could not start server» και σταματούσε.
# Ο φύλακας που δεν ξεκινά διαβάζεται ως φύλακας που δεν έχει τίποτα να πει.
#
# Η πρίζα ζει πλέον ΜΕΣΑ στον προσωρινό φάκελο του τρεξίματος, που σβήνει με το
# trap, και το TCP κλείνει τελείως (`listen_addresses=''`): δεν υπάρχει πια
# κοινός πόρος για να συγκρουστεί κανείς. Δύο αντίγραφα του σεναρίου τρέχουν
# ταυτόχρονα χωρίς να ξέρουν το ένα για το άλλο.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$BIN" ] || { echo "✗ Δεν βρέθηκε PostgreSQL. Εγκατέστησε postgresql-16."; exit 1; }
export PATH="$BIN:$PATH"
WORK="$(mktemp -d)"
PGDATA="$WORK/pgdata"

cleanup() { "$BIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

# Ο Postgres αρνείται να τρέξει ως root, οπότε η βάση ανήκει στον χρήστη
# `postgres` όταν το σενάριο τρέχει με δικαιώματα root (CI, container).
AS=""
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  AS="su postgres -s /bin/bash -c"
  chown -R postgres:postgres "$WORK"
fi
# Το `su` δεν κληρονομεί το PATH, οπότε οι διαδρομές γράφονται πλήρεις.
run_pg() { if [ -n "$AS" ]; then $AS "PATH=$BIN:\$PATH $1"; else bash -c "$1"; fi; }

run_pg "$BIN/initdb -D $PGDATA -U postgres --auth=trust" 
run_pg "$BIN/pg_ctl -D $PGDATA -o \"-k $WORK -c listen_addresses=''\" -l $PGDATA/log start" 
for _ in $(seq 1 20); do psql -h "$WORK" -U postgres -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done

PSQL="psql -h $WORK -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c 'create database posdb' >/dev/null
$PSQL -d posdb -f "$ROOT/scripts/db/platform-stub.sql" >/dev/null

# Τοπικό αντίγραφο χωρίς τις επεκτάσεις της πλατφόρμας.
MIG="$WORK/mig"; mkdir -p "$MIG"
for f in "$ROOT"/supabase/migrations/*.sql; do
  sed -E 's/^([[:space:]]*)(CREATE EXTENSION[^;]*"(pg_cron|pg_net|pg_stat_statements|supabase_vault)"[^;]*;)/\1-- [db-replay] \2/I' "$f" > "$MIG/$(basename "$f")"
done

fails=0; count=0
for f in $(ls "$MIG"/*.sql | sort); do
  count=$((count + 1))
  if ! out=$($PSQL -d posdb -f "$f" 2>&1); then
    fails=$((fails + 1))
    echo "✗ $(basename "$f")"
    echo "$out" | grep -m2 -E 'ERROR|DETAIL' | sed 's/^/    /'
  fi
done

if [ "$fails" -gt 0 ]; then
  echo ""
  echo "🔴 $fails από $count μεταναστεύσεις δεν τρέχουν."
  exit 1
fi

# ── ΒΛΕΠΕΙ Ο Α ΤΑ ΔΕΔΟΜΕΝΑ ΤΟΥ Β; ───────────────────────────────────────────
# Ο μόνος έλεγχος του αποθετηρίου που ρωτά το ίδιο το Postgres. Κάθε αποτυχία
# μέσα στο αρχείο σηκώνει exception, οπότε το ON_ERROR_STOP το κάνει κόκκινο.
if ! out=$($PSQL -d posdb -f "$ROOT/scripts/db/rls-probe.sql" 2>&1); then
  echo "🔴 Η απομόνωση δεδομένων ΔΕΝ κρατά:"
  echo "$out" | grep -m3 -E 'ERROR|ΔΙΑΡΡΟΗ|ΕΚΘΕΣΗ' | sed 's/^/    /'
  exit 1
fi
probes=$(echo "$out" | grep -c 'probe:' || true)

# ── ΤΙ ΜΠΟΡΕΙ ΝΑ ΚΑΛΕΣΕΙ ΚΑΠΟΙΟΣ ΧΩΡΙΣ ΛΟΓΑΡΙΑΣΜΟ ──────────────────────────
# Κάθε SECURITY DEFINER παρακάμπτει την RLS. Όσες φτάνουν στον ανώνυμο πρέπει
# να είναι ονομαστικά γραμμένες, με τον λόγο τους.
if ! sout=$($PSQL -d posdb -f "$ROOT/scripts/db/anon-surface.sql" 2>&1); then
  echo "🔴 Η δημόσια επιφάνεια της βάσης άλλαξε:"
  echo "$sout" | grep -m6 -E 'ERROR|ΝΕΑ|ΓΡΑΜΜΕΣ|SECURITY' | sed 's/^/    /'
  exit 1
fi
probes=$((probes + $(echo "$sout" | grep -c 'probe:' || true)))

# ── ΤΡΕΧΕΙ ΑΚΟΜΗ ΤΟ ΣΕΝΑΡΙΟ ΤΟΥ STAGING; ────────────────────────────────────
# Το scripts/db/staging-demo.sql γεμίζει λογαριασμό δοκιμών με μια ολόκληρη
# χρονιά. Γράφτηκε μία φορά και θα σάπιζε στην πρώτη μετονομασία στήλης — όπως
# σάπισε ήδη ένα λεκτικό που υποσχόταν αρχεία που δεν υπήρχαν. Εδώ τρέχει σε
# κάθε έλεγχο, οπότε δεν μπορεί να αποκλίνει από το σχήμα σιωπηλά.
$PSQL -d posdb -c "insert into auth.users(id,email) values (gen_random_uuid(),'demo@propertyos.gr')" >/dev/null
if ! out=$($PSQL -d posdb -f "$ROOT/scripts/db/staging-demo.sql" 2>&1); then
  echo "🔴 Το σενάριο του staging δεν τρέχει πια πάνω στο σχήμα:"
  echo "$out" | grep -m3 -E 'ERROR|DETAIL' | sed 's/^/    /'
  exit 1
fi

# ── ΣΥΜΦΩΝΕΙ Η ΒΑΣΗ ΜΕ ΤΗΝ ΕΦΑΡΜΟΓΗ; ────────────────────────────────────────
# Τα νούμερα του Προγράμματος Πρόσκλησης ζουν σε ΔΥΟ σημεία: στο
# lib/referral/referral.ts και μέσα στην `claim_referral_bonus`. Έχουν ήδη
# αποκλίνει μία φορά — η οθόνη υποσχόταν έναν μήνα και η βάση έδινε δύο.
TS_VOL=$(grep -oE 'INDIV_VOLUME_TARGET = [0-9]+' "$ROOT/lib/referral/referral.ts" | grep -oE '[0-9]+')
TS_PRO=$(grep -oE 'PRO_PAID_TARGET = [0-9]+'     "$ROOT/lib/referral/referral.ts" | grep -oE '[0-9]+')
SRC=$(psql -h "$WORK" -U postgres -d posdb -X -A -t \
  -c "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='claim_referral_bonus'" \
  | grep -vE "^\s*--")
DB_VOL=$(echo "$SRC" | grep -oE "'indiv_volume' then v_target := [0-9]+" | grep -oE '[0-9]+$' || true)
DB_PRO=$(echo "$SRC" | grep -oE "'pro_paid'     then v_target := [0-9]+" | grep -oE '[0-9]+$' || true)

# Το ίδιο για τις ημέρες της δοκιμής: ζούσαν χειρόγραφες ως `interval '30
# days'` μέσα στο σώμα της `user_plan_rank`, όπου δεν τις βλέπει κανείς. Μια
# απόκλιση εκεί σημαίνει ότι η οθόνη μετρά αλλιώς από τη βάση — και η βάση
# είναι που κόβει το «Προσθήκη ακινήτου».
TS_TRIAL=$(grep -oE 'TRIAL_DAYS = [0-9]+' "$ROOT/lib/billing/plans.ts" | grep -oE '[0-9]+')
DB_TRIAL=$(psql -h "$WORK" -U postgres -d posdb -X -A -t -c "select public.trial_days()" | tr -d '[:space:]')

# ΚΑΙ ΟΙ ΗΜΕΡΕΣ ΧΑΡΙΤΟΣ, ΠΟΥ ΤΕΛΕΙΩΝΟΥΝ ΣΕ ΔΙΑΓΡΑΦΗ. Εδώ η απόκλιση δεν κόβει
# ένα κουμπί: σβήνει λογαριασμό. Αν η σελίδα υπόσχεται τριάντα ημέρες και ο
# σαρωτής μετρά δεκαπέντε, ο άνθρωπος χάνει τα δεδομένα του δεκαπέντε ημέρες
# πριν από την ημερομηνία που του γράψαμε.
TS_GRACE=$(grep -oE 'ACCOUNT_GRACE_DAYS = [0-9]+' "$ROOT/lib/billing/plans.ts" | grep -oE '[0-9]+')
DB_GRACE=$(psql -h "$WORK" -U postgres -d posdb -X -A -t -c "select public.account_grace_days()" | tr -d '[:space:]')

# ΚΑΙ Η ΣΕΙΡΑ ΤΩΝ ΠΑΚΕΤΩΝ. Το `public.plan_rank` κρίνει τι βλέπει ο χρήστης μέσα
# στη βάση (όρια ακινήτων, κλειδωμένες καρτέλες)· το `PLAN_ORDER` κρίνει τα ίδια
# στην οθόνη. Ενα πακέτο που θα μπει αύριο σε ΕΝΑ από τα δύο —ή θα μπει σε άλλη
# θέση— δεν βγάζει κανένα σφάλμα: βγάζει οθόνη που υπόσχεται και βάση που κόβει.
TS_RANKS=$(grep -oE "PLAN_ORDER: PlanId\[\] = \[[^]]*\]" "$ROOT/lib/billing/plans.ts" \
  | grep -oE "'[a-z]+'" | tr -d "'" | awk '{printf "%s:%d ", $0, NR-1}' | sed 's/ $//')
TS_PLANS=$(grep -oE "PLAN_ORDER: PlanId\[\] = \[[^]]*\]" "$ROOT/lib/billing/plans.ts" \
  | grep -oE "'[a-z]+'" | paste -sd, -)
DB_RANKS=$(psql -h "$WORK" -U postgres -d posdb -X -A -t -c \
  "select string_agg(p || ':' || public.plan_rank(p), ' ' order by i) from unnest(array[$TS_PLANS]) with ordinality t(p, i)" \
  | sed 's/^ *//;s/ *$//')

# ΚΑΙ ΟΙ ΤΙΜΕΣ. Το `charge_upcoming` ανακοινώνει ΠΟΣΟ θα φύγει από την κάρτα, και
# το ποσό το γράφει η βάση: το κείμενο του email τρέχει σε συνάρτηση άκρης, που
# δεν βλέπει το lib/billing/plans.ts. Μια αύξηση τιμής σε ΕΝΑ από τα δύο σημεία
# δεν βγάζει κανένα σφάλμα — βγάζει email που ανακοινώνει λάθος χρέωση.
TS_PRICES=$(node -e "
const s = require('fs').readFileSync('$ROOT/lib/billing/plans.ts', 'utf8');
const out = [];
for (const m of s.matchAll(/id: '([a-z]+)',.*?priceMonthly: ([0-9.]+), priceAnnual: ([0-9.]+)/g))
  out.push(m[1] + ':' + Number(m[2]).toFixed(2) + ':' + Number(m[3]).toFixed(2));
console.log(out.join(' '));
")
DB_PRICES=$(psql -h "$WORK" -U postgres -d posdb -X -A -t -c \
  "select string_agg(p || ':' || to_char(public.plan_price(p, 'monthly'), 'FM990.00') || ':' || to_char(public.plan_price(p, 'annual'), 'FM990.00'), ' ' order by i) from unnest(array[$TS_PLANS]) with ordinality t(p, i)" \
  | sed 's/^ *//;s/ *$//')

drift=0
[ "$TS_VOL" = "$DB_VOL" ] || { echo "✗ στόχος όγκου: εφαρμογή $TS_VOL, βάση ${DB_VOL:-—}"; drift=1; }
[ "$TS_PRO" = "$DB_PRO" ] || { echo "✗ στόχος συνδρομητών: εφαρμογή $TS_PRO, βάση ${DB_PRO:-—}"; drift=1; }
[ "$TS_TRIAL" = "$DB_TRIAL" ] || { echo "✗ ημέρες δοκιμής: εφαρμογή $TS_TRIAL, βάση ${DB_TRIAL:-—}"; drift=1; }
[ "$TS_GRACE" = "$DB_GRACE" ] || { echo "✗ ημέρες χάριτος: εφαρμογή $TS_GRACE, βάση ${DB_GRACE:-—}"; drift=1; }
[ "$TS_RANKS" = "$DB_RANKS" ] || { echo "✗ σειρά πακέτων: εφαρμογή «$TS_RANKS», βάση «${DB_RANKS:-—}»"; drift=1; }
[ "$TS_PRICES" = "$DB_PRICES" ] || { echo "✗ τιμές πακέτων: εφαρμογή «$TS_PRICES», βάση «${DB_PRICES:-—}»"; drift=1; }
[ "$drift" = "0" ] || { echo ""; echo "🔴 Η βάση δίνει άλλα από αυτά που γράφει η οθόνη."; exit 1; }

echo "✅ $count μεταναστεύσεις τρέχουν σε πραγματικό Postgres, $probes έλεγχοι απομόνωσης"
echo "   κρατούν, το σενάριο του staging γεμίζει λογαριασμό, και οι στόχοι του"
echo "   Προγράμματος Πρόσκλησης συμφωνούν με το"
echo "   lib/referral/referral.ts ($TS_VOL, $TS_PRO), και η δοκιμή είναι $TS_TRIAL"
echo "   ημέρες και στα δύο, η σειρά των πακέτων είναι «$TS_RANKS»,"
echo "   και οι τιμές συμφωνούν: «$TS_PRICES»."
