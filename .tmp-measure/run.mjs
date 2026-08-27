import { chromium } from 'playwright-core'
import { chromePath } from '../scripts/lib/chrome.mjs'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
const srv = createServer((req,res)=>{
  const p = req.url.split('?')[0]
  try {
    if (p.startsWith('/fonts/')) { res.setHeader('content-type','font/woff2'); res.end(readFileSync('/home/user/property/public'+p)); return }
    res.setHeader('content-type','text/html; charset=utf-8'); res.end(readFileSync('/home/user/property/.tmp-measure/m.html'))
  } catch(e){ res.statusCode=404; res.end('no') }
})
await new Promise(r=>srv.listen(45231,r))
const b = await chromium.launch({ executablePath: chromePath(), args:['--no-sandbox'] })
const pg = await b.newPage({ viewport:{width:320,height:800}, deviceScaleFactor:2 })
await pg.goto('http://127.0.0.1:45231/')
await pg.evaluate(()=>document.fonts.ready)
const res = await pg.evaluate(()=>{
  const strs = ['Παράδειγμα: λογαριασμός ΔΕΗ, υδραυλικός','Παράδειγμα: ΔΕΗ, υδραυλικός','Παράδειγμα: λογαριασμός ΔΕΗ','ΔΕΗ, υδραυλικός, ασφάλεια']
  const out = []
  for (const s of strs){
    const el = document.createElement('span'); el.className='m'; el.textContent = s
    document.body.appendChild(el)
    out.push([s, el.getBoundingClientRect().width])
  }
  return { out, fontOk: document.fonts.check('14px Inter') }
})
console.log('fontOk', res.fontOk)
for (const [s,w] of res.out) console.log(w.toFixed(2).padStart(7), s)
await b.close(); srv.close()
