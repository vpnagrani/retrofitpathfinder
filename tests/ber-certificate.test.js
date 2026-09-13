import {test} from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import {extractCertificate} from '../server/ber-certificate.js';
const pdf=text=>new Promise(resolve=>{const d=new PDFDocument(),chunks=[];d.on('data',c=>chunks.push(c));d.on('end',()=>resolve(Buffer.concat(chunks)));d.text(text);d.end();});
test('real certificate PDF separates primary energy from final energy and excludes identifiers',async()=>{
 const b=await pdf('Building Energy Rating (BER) Certificate\nBER rating: D\nDate of Issue: 10/06/2026\nAnnual Primary Energy\nUse per floor area: 260 kWh/(m2.y)\nAnnual Final Energy\nUse per floor area: 180 kWh/(m2.y)\nAddress: PRIVATE ADDRESS\nMPRN: 12345678901');
 const result=await extractCertificate(b);assert.equal(result.candidate.primaryEnergy,260);assert.equal(result.candidate.rating,'D');assert.equal(result.candidate.issuedOn,'2026-06-10');assert.ok(!JSON.stringify(result).includes('PRIVATE ADDRESS'));assert.ok(!JSON.stringify(result).includes('12345678901'));
});
test('ambiguous or unsupported PDF text falls back to manual review',async()=>{
 const b=await pdf('Building Energy Rating Certificate\nAnnual Primary Energy\nUse per floor area: 220 kWh/(m2.y)\nAnnual Primary Energy\nUse per floor area: 260 kWh/(m2.y)');
 assert.equal((await extractCertificate(b)).candidate.primaryEnergy,null);
 await assert.rejects(()=>extractCertificate(Buffer.from('not pdf')),/PDF/);
});
test('advisory reports are excluded from certificate ingestion',async()=>{
 const r=await extractCertificate(await pdf('BER Advisory Report\nPotential energy upgrades\nPrimary energy 200 kWh/m2/year'));
 assert.equal(r.status,'manual-entry');assert.equal(r.candidate.primaryEnergy,null);
});
