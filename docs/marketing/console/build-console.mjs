// Builds email-console.html by inlining the embedded font + console data
// into the template. Run from this directory after regenerating console-data.json
// (see gen-console-data.ts). Usage: node build-console.mjs
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname} from 'node:path'
const dir=dirname(fileURLToPath(import.meta.url))+'/'
const tpl=readFileSync(dir+'console-template.html','utf8')
const font=readFileSync(dir+'inter.css','utf8')
const data=readFileSync(dir+'console-data.json','utf8').replace(/<\//g,'<\\/')
const out=tpl.replace('__FONT__',()=>font).replace('__DATA__',()=>data)
writeFileSync(dir+'email-console.html',out)
console.log('built',(out.length/1024).toFixed(0)+'KB')
