import { chromePath } from '../scripts/lib/chrome.mjs'
import { benchUrl } from '../scripts/lib/paths.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const b = await chromium.launch({ executablePath: chromePath(), args:['--no-sandbox'] })
for (const scene of ['loanAdvisor','loan','roi']) {
  const p = await b.newPage({ viewport:{width:1280,height:1200} })
  await p.goto(benchUrl(scene), { waitUntil:'networkidle' }); await p.waitForTimeout(500)
  for(let i=0;i<2;i++){ await p.evaluate(()=>{for(const x of document.querySelectorAll('[aria-expanded="false"]')) (x instanceof HTMLElement)&&x.click()}); await p.waitForTimeout(350) }
  const r = await p.evaluate(() => {
    const bad=[]
    for (const g of document.querySelectorAll('.fixed-cols, .kpi-row')) {
      const t=[...g.children].filter(c=>c.classList.contains('kpi-card'))
      if (t.length<2) continue
      const rows={}
      for (const c of t){ const b=c.getBoundingClientRect(); (rows[Math.round(b.top)] ||= []).push(Math.round(b.height)) }
      for (const [top,hs] of Object.entries(rows)) if (new Set(hs).size>1) bad.push(`top=${top} ύψη ${hs.join('/')}`)
      // και οι αριθμοί στην ίδια γραμμή βάσης;
      const vs=t.map(c=>{const v=c.querySelector('.kpi-value'); return v?Math.round(v.getBoundingClientRect().top):null}).filter(x=>x!=null)
      if (new Set(vs).size>1) bad.push(`αριθμοί σε ${new Set(vs).size} ύψη: ${[...new Set(vs)].join(',')}`)
    }
    return bad
  })
  console.log(scene, r.length? JSON.stringify(r):'✓ ίσα κουτιά, ίδια γραμμή')
  await p.close()
}
await b.close()
