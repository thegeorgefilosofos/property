// Ο σαρωτής αρχείων της διαγραφής λογαριασμού.
import { strict as assert } from 'node:assert'
import { sweepOwnFiles, type SweepClient } from './accountSweep'

type Call = { bucket: string; paths: string[] }

function fake(rows: unknown, opts: { rpcError?: string; failBucket?: string } = {}) {
  const calls: Call[] = []
  const client: SweepClient = {
    rpc: async () => ({ data: rows, error: opts.rpcError ? { message: opts.rpcError } : null }),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.push({ bucket, paths })
          return opts.failBucket === bucket
            ? { data: null, error: { message: 'δεν επιτρέπεται' } }
            : { data: paths, error: null }
        },
      }),
    },
  }
  return { client, calls }
}

const row = (bucket_id: string, name: string) => ({ bucket_id, name })

// Το tsx μεταγλωττίζει σε cjs, όπου το await στο ανώτατο επίπεδο δεν υπάρχει.
async function main() {

  // ── ΚΑΘΕ ΑΡΧΕΙΟ ΦΕΥΓΕΙ, ΟΜΑΔΟΠΟΙΗΜΕΝΟ ΑΝΑ ΚΑΔΟ ────────────────────────────
  {
    const { client, calls } = fake([
      row('property-files', 'u/a.pdf'),
      row('lease-documents', 'u/l.pdf'),
      row('property-files', 'u/b.pdf'),
    ])
    const out = await sweepOwnFiles(client)
    assert.equal(out.deleted, 3)
    assert.equal(out.failed, 0)
    assert.equal(out.error, '')
    assert.equal(calls.length, 2, 'ένα αίτημα ανά κάδο, όχι ένα ανά αρχείο')
    const files = calls.find(c => c.bucket === 'property-files')
    assert.deepEqual(files?.paths, ['u/a.pdf', 'u/b.pdf'])
  }

  // ── ΚΑΝΕΝΑ ΑΡΧΕΙΟ ────────────────────────────────────────────────────────
  {
    const { client, calls } = fake([])
    const out = await sweepOwnFiles(client)
    assert.deepEqual(out, { deleted: 0, failed: 0, error: '' })
    assert.equal(calls.length, 0, 'κανένα αίτημα χωρίς αρχεία')
  }

  // ── ΟΤΑΝ Η ΒΑΣΗ ΔΕΝ ΑΠΑΝΤΑ, ΤΟ ΛΕΕΙ ───────────────────────────────────────
  {
    const { client, calls } = fake(null, { rpcError: 'δεν διαβάστηκε' })
    const out = await sweepOwnFiles(client)
    assert.equal(out.error, 'δεν διαβάστηκε')
    assert.equal(out.deleted, 0)
    assert.equal(calls.length, 0)
  }

  // ── ΕΝΑΣ ΚΑΔΟΣ ΠΟΥ ΑΡΝΕΙΤΑΙ ΔΕΝ ΠΑΡΑΣΥΡΕΙ ΤΟΥΣ ΑΛΛΟΥΣ ─────────────────────
  // Το κρίσιμο: η αποτυχία μετριέται και ΔΕΝ περνά για επιτυχία. Οσο το `failed`
  // έμενε μηδέν, η οθόνη θα έλεγε «διαγράφηκαν» για αρχεία που έμειναν.
  {
    const { client } = fake([
      row('maintenance-photos', 't/1.jpg'),
      row('property-files', 'u/a.pdf'),
    ], { failBucket: 'maintenance-photos' })
    const out = await sweepOwnFiles(client)
    assert.equal(out.deleted, 1, 'ο κάδος που δέχτηκε μετρήθηκε')
    assert.equal(out.failed, 1, 'ο κάδος που αρνήθηκε μετρήθηκε ξεχωριστά')
    assert.equal(out.error, 'δεν επιτρέπεται')
  }

  // ── ΧΙΛΙΑ ΟΝΟΜΑΤΑ ΣΠΑΝΕ ΣΕ ΚΟΜΜΑΤΙΑ ΤΩΝ ΕΚΑΤΟ ────────────────────────────
  // Ενα αίτημα με χίλια ονόματα είναι ένα αίτημα που, αν λήξει, χάνει χίλια.
  {
    const rows = Array.from({ length: 250 }, (_, i) => row('property-files', `u/${i}.pdf`))
    const { client, calls } = fake(rows)
    const out = await sweepOwnFiles(client)
    assert.equal(out.deleted, 250)
    assert.equal(calls.length, 3, '250 ονόματα σε τρία αιτήματα')
    assert.deepEqual(calls.map(c => c.paths.length), [100, 100, 50])
  }

  // ── ΣΚΟΥΠΙΔΙΑ ΑΠΟ ΤΗ ΒΑΣΗ ΔΕΝ ΓΙΝΟΝΤΑΙ ΑΙΤΗΜΑ ────────────────────────────
  {
    const { client, calls } = fake([null, { bucket_id: 'x' }, { name: 'y' }, row('avatars', 'u/a.png')])
    const out = await sweepOwnFiles(client)
    assert.equal(out.deleted, 1)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].paths, ['u/a.png'])
  }

  console.log('✓ ο σαρωτής σβήνει κάθε αρχείο, μετρά τι δεν έφυγε και δεν κρύβει αποτυχία')
}

main()
