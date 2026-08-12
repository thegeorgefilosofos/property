import {buildWorkbook} from '/home/user/property/app/dashboard/components/accountantExport';
import {XLSX} from '/home/user/property/app/dashboard/components/xlsxStyle';
import * as fs from 'fs';
const D='/tmp/claude-0/-home-user-property/fe22d132-56da-5d8b-b87a-58829319f7e4/scratchpad/';
const BOOK=[{date:'2026-01-10',type:'expense',category:'Ρεύμα',description:'ΔΕΗ',amount:95.49,supplier_country:'GR',supply:'domestic'},{date:'2026-03-05',type:'income',category:'Ενοίκια',description:'Μίσθωμα',amount:700}];
const wb=buildWorkbook({year:2026,propName:'Δ',statementLines:[],provisionMonthly:0,book:BOOK as never,myData:{vat:'none'}});
fs.writeFileSync(D+'raw.xlsx', new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array'}) as ArrayBuffer));
const wb2=buildWorkbook({year:2026,propName:'Δ',statementLines:[],provisionMonthly:0,book:BOOK as never});
fs.writeFileSync(D+'nomydata_raw.xlsx', new Uint8Array(XLSX.write(wb2,{bookType:'xlsx',type:'array'}) as ArrayBuffer));
