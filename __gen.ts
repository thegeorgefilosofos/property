import {buildWorkbook} from '/home/user/property/app/dashboard/components/accountantExport';
import {workbookBytes} from '/home/user/property/app/dashboard/components/xlsxStyle';
import {unzipSync, strFromU8} from 'fflate';
import * as fs from 'fs';
const BOOK=[
 {date:'2026-01-10',type:'expense',category:'Ρεύμα',description:'ΔΕΗ',amount:95.49,supplier_country:'GR',supply:'domestic'},
 {date:'2026-02-11',type:'expense',category:'Λογιστής',description:'Αμοιβή',amount:200,supplier_country:'GR',supply:'domestic'},
 {date:'2026-02-20',type:'expense',category:'Άλλο',description:'Διαφήμιση Google',amount:50,supplier_country:'IE',supply:'intra_eu'},
 {date:'2026-03-05',type:'income',category:'Ενοίκια',description:'Μίσθωμα',amount:700},
];
const wb=buildWorkbook({year:2026,propName:'Δ',ownerAfm:'094014201',statementLines:[{label:'Έσοδα',amount:700,kind:'line'}],provisionMonthly:10,book:BOOK as never,myData:{vat:'none'}});
const bytes=workbookBytes(wb);
fs.writeFileSync('/tmp/claude-0/-home-user-property/fe22d132-56da-5d8b-b87a-58829319f7e4/scratchpad/out.xlsx', bytes);
const zip=unzipSync(bytes);
console.log('ENTRIES', Object.keys(zip).join('\n'));
fs.mkdirSync('/tmp/claude-0/-home-user-property/fe22d132-56da-5d8b-b87a-58829319f7e4/scratchpad/x',{recursive:true});
for(const k of Object.keys(zip)){ const p='/tmp/claude-0/-home-user-property/fe22d132-56da-5d8b-b87a-58829319f7e4/scratchpad/x/'+k.replace(/\//g,'__'); fs.writeFileSync(p, Buffer.from(zip[k])); }
console.log('--- workbook.xml ---'); console.log(strFromU8(zip['xl/workbook.xml']));
