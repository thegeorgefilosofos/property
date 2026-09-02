import { chromePath } from '../scripts/lib/chrome.mjs'
import { benchUrl } from '../scripts/lib/paths.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const OUT='/tmp/claude-0/-home-user-property/fe22d132-56da-5d8b-b87a-58829319f7e4/scratchpad/shots'
const b = await chromium.launch({ executablePath: chromePath(), args:['--no-sandbox'] })
const p = await b.newPage({ viewport:{width:1280,height:1000}, deviceScaleFactor:2 })
await p.goto(benchUrl('portfolio'), { waitUntil:'networkidle' }); await p.waitForTimeout(600)
const r = await p.evaluate(() => {
  const box = el => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } }
  const tiles = [...document.querySelectorAll('.kpi-card')].map(t => {
    const label = t.querySelector('.kpi-label'), val = t.querySelector('.kpi-value')
    const sub = t.lastElementChild !== val ? t.lastElementChild : null
    const cs = getComputedStyle(t)
    return { txt: (label?.textContent||'').trim(), ...box(t), pad: cs.padding,
      labelH: label ? Math.round(label.getBoundingClientRect().height) : null,
      valH: val ? Math.round(val.getBoundingClientRect().height) : null,
      valFs: val ? getComputedStyle(val).fontSize : null,
      hasSub: !!(sub && sub !== label && (sub.textContent||'').trim()),
      inkH: (label?Math.round(label.getBoundingClientRect().height):0) + (val?Math.round(val.getBoundingClientRect().height):0) }
  })
  const plains = [...document.querySelectorAll('.kpi-plain')].map(t => {
    const label = t.querySelector('.kpi-label'), val = t.querySelector('.kpi-value')
    return { txt:(label?.textContent||'').trim(), ...box(t), valFs: val?getComputedStyle(val).fontSize:null }
  })
  return { tiles, plains }
})
console.log(JSON.stringify(r,null,1).slice(0,2600))
await p.screenshot({ path: `${OUT}/portfolio-before.png` })
await b.close()
