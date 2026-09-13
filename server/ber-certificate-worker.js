// Isolated, bounded process: no API key, file persistence or network fetches.
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const buffers=[];let bytes=0;
for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>5*1024*1024)process.exit(1);buffers.push(chunk);}
const task=getDocument({data:new Uint8Array(Buffer.concat(buffers)),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,verbosity:0});
const doc=await task.promise,pages=doc.numPages;
if(pages>5){await task.destroy();process.exit(1);}
let text='';
for(let i=1;i<=doc.numPages;i++){
  const page=await doc.getPage(i),content=await page.getTextContent();
  text+=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n';
  if(text.length>80000){await task.destroy();process.exit(1);}
}
await task.destroy();
const candidate={rating:'unknown',issuedOn:'',primaryEnergy:null};
const certificate=/Building\s+Energy\s+Rating(?:\s*\(BER\))?\s+Certificate/i.test(text);
// Advisory content is never used, even if bundled with a certificate.
const usable=certificate&&!/\bAdvisory\s+Report\b/i.test(text);
const unique=a=>[...new Set(a)];
if(usable){
  const energies=unique([...text.matchAll(/\b(?:Annual\s+Primary\s+Energy|Primary\s+Energy(?:\s+Use)?|Energy\s+Performance\s+Indicator)\s*[:\s]*(?:Use\s+per\s+floor\s+area\s*:\s*)?(\d+(?:\.\d+)?)\s*kWh\s*\/\s*\(?m(?:2|²)/gi)].map(m=>Number(m[1])));
  if(energies.length===1&&energies[0]<=2000)candidate.primaryEnergy=energies[0];
  const ratings=unique([...text.matchAll(/\b(?:BER\s+rating|rating\s+for\s+the\s+building\s+detailed\s+below\s+is)\s*:\s*(A0|[A-E][1-3]?|F|G)\b/gi)].map(m=>m[1].toUpperCase()));
  if(ratings.length===1)candidate.rating=ratings[0];
  const dates=unique([...text.matchAll(/\b(?:Date\s+of\s+Issue|Issue\s+date|Validity)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/gi)].map(m=>{
    if(/^\d{4}-/.test(m[1]))return m[1];const [d,mo,y]=m[1].split(/[\/-]/);return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }).filter(d=>!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d));
  if(dates.length===1)candidate.issuedOn=dates[0];
}
process.stdout.write(JSON.stringify({status:usable?'review-required':'manual-entry',candidate,notice:usable?'Check every extracted field against your certificate. Missing or ambiguous fields need manual entry; this does not authenticate the certificate.':'No supported certificate text found. Scanned PDFs and advisory reports are not extracted; use manual certificate entry.',pages}));
