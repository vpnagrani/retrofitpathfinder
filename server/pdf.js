import PDFDocument from 'pdfkit';
import { range,money } from './pathway.js';

export function makePDF(snapshot) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margins:{top:55,bottom:58,left:48,right:48},bufferPages:true,info:{Title:`Retrofit brief - ${snapshot.profile.name}`,Author:'Retrofit Pathfinder',Subject:'Provisional homeowner pathway for qualified assessment'}});
    const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
    const W=499;
    const clean=s=>String(s).replace(/[–—]/g,'-').replace(/→/g,'then').replace(/€\s?/g,'EUR ').replace(/[☐✓]/g,'[ ]');
    const room=n=>{if(doc.y+n>760)doc.addPage();};
    const title=(s,size=18)=>{room(50);doc.moveDown(.5).font('Helvetica-Bold').fontSize(size).fillColor('#064f43').text(clean(s),{width:W}).moveDown(.5);};
    const para=(s,opts={})=>{const text=clean(s);doc.font('Helvetica').fontSize(opts.size||10).fillColor(opts.color||'#344740');const h=doc.heightOfString(text,{width:W,lineGap:4});room(h+10);doc.text(text,{width:W,lineGap:4,...opts}).moveDown(.6);};
    const bullet=s=>para('[ ] '+s);
    doc.rect(0,0,595,12).fill('#00745d');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#00745d').text('RETROFIT PATHFINDER');
    doc.moveDown(1.4);title('Your home. A clear way forward.',29);
    para('CONTRACTOR BRIEF  /  PROVISIONAL ASSESSMENT PACK',{size:9,color:'#667b71'});
    title(snapshot.profile.name,22);
    const p=snapshot.profile,plan=snapshot.plan;
    para(`${p.county} | ${p.type==='apartment'?'Apartment':p.type==='semi'?'Semi-detached':p.type==='terrace'?'Mid-terrace':'Detached'} | Built ${p.year} | ${p.area} m2 | Reported BER ${p.ber}`);
    para(`Report version ${snapshot.version} | Created ${new Date(snapshot.createdAt).toLocaleDateString('en-IE')} | Scenario: ${plan.scenario}`);
    if(p.synthetic)para('SYNTHETIC EXAMPLE HOME - replace all details with verified dwelling evidence.',{color:'#95601b'});
    title('The planning envelope');
    para(`Priced measures subtotal: ${range(plan.gross)}\nContingency (not added): ${range(plan.contingency)}\nPriced subtotal before support: ${range(plan.total)}\nPublished grant reference on priced items: ${money(plan.funding?.breakdowns?.beh.referenceGrantSubtotal??0)}\nIllustrative net at published rates: ${money(plan.funding?.breakdowns?.beh.referenceNetSubtotal??0)}\nHomeowner budget: ${money(p.budget)}`);
    para('Published grant values are shown independently of eligibility. Net figures illustrate the published rate applying; they are not a personal award or quotation. Matched costs use exact SEAI 2025 medians. Quote-required items are excluded, not free; the full budget remains unknown. No contingency is added. A contractor must inspect and price the actual scope. Any potential BER shown is an illustrative sensitivity range, not a certified result.',{color:'#95601b'});
    title('Funding routes and payment timing');
    const f=plan.funding;
    if(f){
      for(const route of Object.values(f.breakdowns||{})){
        room(110);title(route.route==='beh'?'BEH: median, grant and net payment':'OSS: cost reference, grant and net payment');para(route.costNote);para(route.conditions);
        for(const row of route.rows){const cost=row.median===null?'Quote required':money(row.median),grant=money(row.referenceGrant),net=row.referenceNet===null?'Quote required':money(row.referenceNet);room(110);para(row.title+' | Median cost reference: '+cost+' | Published SEAI grant: '+grant+' | Net reference if eligible: '+net);para(row.status+'. '+row.referenceNote+' '+row.reason,{size:9});}
        para('Priced subset: '+money(route.medianSubtotal)+'; conditional net: '+money(route.referenceNetSubtotal)+'. Unpriced items excluded, not free.');para('Median cost source: '+route.costSource,{size:8,link:route.costSource});para('Grant source: '+route.source,{size:8,link:route.source});
      }
      const b=f.oss.benchmark;
      if(f.breakdowns?.oss.applicantType==='ahb')para('OSS AHB package cost: quote required. The published whole-project cost dataset covers private homes, not AHBs.');
      else para('OSS historical private-home benchmark: median works '+money(b.works)+' minus historical median grant '+money(b.grant)+' = calculated benchmark net '+money(Math.max(0,b.works-b.grant))+'. SEAI separately reports homeowner median '+money(b.homeowner)+'; independent medians do not subtract. This is not a current grant award.');
      para(f.oss.source,{size:8,link:f.oss.source});para(f.oss.conditions);para('BEH timing: '+f.individual.timing);para('OSS timing: '+f.oss.timing);
      if(f.assessment){const a=f.assessment;para('Home Energy Assessment: quote required; conditional support '+money(350)+'. Net: quote minus approved support.');para(a.conditions);para(a.example);para(a.source,{size:8,link:a.source});}
      para('Fully Funded Energy Upgrades: '+f.funded.status+'. '+f.funded.timing);para(f.funded.conditions);
    }
    if(plan.berEvidence){title('Synthetic BER evidence');const b=plan.berEvidence;para(b.notice);para(b.id+' | BER '+b.rating+' | '+b.primaryEnergy+' kWh/m2/year | '+b.co2+' kgCO2/m2/year | Example assessment '+b.assessmentDate);for(const r of b.recommendations)bullet(r);}
    title('The homeowner profile');
    para('Applicant type: '+(p.applicantType||'not confirmed')+'; AHBRA registration reported: '+(p.ahbRegistered||'not confirmed')+'.');
    para(`First occupied: ${p.occupiedYear}; heating: ${p.heating}; walls: ${p.walls}; attic: ${p.attic}; damp: ${p.damp}; ventilation: ${p.ventilation}; traditional construction: ${p.traditional}.\nOwnership: ${p.ownership}; MPRN exists: ${p.mprn}; prior grants: ${p.priorGrants}.`);
    para(`Evidence reported available (not independently verified): ${p.evidence.length?p.evidence.join(', '):'none recorded'}.`);
    room(220);title('Current BER and potential',18);
    const bp=plan.berPotential;
    if(bp){
      para(`Current rating as reported: ${bp.current.rating||'unknown'}; issue/assessment date: ${bp.current.issuedOn||'not supplied'}; original scale: ${bp.current.scale}; primary energy: ${bp.current.primaryEnergy??'not supplied'} kWh/m2/year.`);
      para(bp.status==='illustrative'?`Potential on 2026 scale: ${[...new Set(bp.ratingRange)].join('-')}; ${bp.energyRange.join('-')} kWh/m2/year. Low-confidence sensitivity illustration, not a DEAP calculation, guarantee or grant approval.`:'Assessment needed. No BER uplift assumed.');
      for(const reason of bp.reasons)para(reason,{size:9});
      for(const assumption of bp.assumptions)para(assumption,{size:9});
      para(`Method ${bp.methodVersion}; SEAI evidence checked ${bp.sourceCheckedAt}. A0 is never predicted. Legacy ratings remain as issued; changing the scale is not a retrofit improvement.`,{size:9});
    }
    doc.addPage();title('An ordered pathway',24);
    para('Order reflects dependencies. Every installation remains subject to competent technical assessment. Design ventilation first and commission it alongside fabric works.');
    for(const [i,m] of plan.steps.entries()) {
      const parts=[
        {text:`${m.phase} | Cost ${range(m.cost)} | See BEH / OSS funding tables`,size:9,color:'#00745d'},
        {text:m.costBasis||'Planning allowance',size:9},
        ...(m.median?[{text:'Published median '+money(m.median)+'. See the route-specific grant and net-payment tables; support is conditional.',size:9}]:[]),
        ...(m.costSource?[{text:m.costSource,size:8,link:m.costSource}]:[]),
        {text:m.why,size:10},
        {text:`Depends on: ${m.depends.length?m.depends.map(k=>plan.steps.find(s=>s.id===k)?.title||k).join('; '):'No preceding measure - begin with assessment'}.`,size:9},
        ...m.checks.map(text=>({text:'[ ] '+text,size:10}))
      ];
      const height=parts.reduce((n,part)=>n+doc.font('Helvetica').fontSize(part.size).heightOfString(clean(part.text),{width:W,lineGap:4})+12,55);
      room(Math.min(height,700));title(`${i+1}. ${m.title}`,14);
      for(const {text,...opts} of parts)para(text,opts);
    }
    doc.addPage();title('Questions before quotations',24);
    for(const q of plan.questions){title(q.title,12);para(q.detail);}
    title('Ask every prospective contractor');
    for(const item of ['Confirm your SEAI registration for the proposed measure and relevant insurance.','Provide an itemised quotation including VAT, exclusions, contingencies, warranties and payment stages.','State the design responsibility, interfaces between trades and commissioning evidence.','Confirm grant approval before starting, the completion documents and post-works BER.','Explain disruption, access, scaffolding and any planning, heritage or electrical-network requirements.'])bullet(item);
    room(190);title('Scenario comparison');
    for(const s of snapshot.scenarios){const b=s.berPotential;para(`${s.scenario.toUpperCase()}: ${s.steps.length} steps; priced subtotal excluding quote-required items ${range(s.total)}; conditional grant on priced items ${money(s.funding?.breakdowns?.beh.referenceGrantSubtotal??0)}; net if approved ${money(s.funding?.breakdowns?.beh.referenceNetSubtotal??0)}. BER potential: ${b?.status==='illustrative'?[...new Set(b.ratingRange)].join('-')+' (2026 scale; illustrative)':'assessment needed'}.`);}
    room(260);title('Evidence, assumptions & provenance',22);
    for(const a of plan.assumptions)para(a,{size:9});
    para(`Rules: ${plan.ruleVersion}. Grant rule review: ${plan.reviewedAt}. Cost evidence checked: ${plan.costReviewedAt||plan.reviewedAt}. AI interview model: ${snapshot.aiModel}. Interview prompt: ${snapshot.promptVersion}. Profile revision: ${snapshot.profileRevision}.`);
    title('SEAI source snapshots',15);
    for(const s of snapshot.sources) {
      room(100);title(s.title,11);
      para(`Snapshot type: ${s.kind}. Retrieved: ${s.retrieved_at}. Last checked: ${s.checked_at}.`,{size:8});
      para(s.url,{size:8,link:s.url,color:'#00745d'});
      para(`Snapshot ID: ${s.id}\nSHA-256: ${s.digest}`,{size:7});
    }
    para('Independent planning tool. Not affiliated with SEAI. Public grant information must be checked again at application. A registered adviser or contractor must validate the home and final specification.');
    const pages=doc.bufferedPageRange();
    for(let i=0;i<pages.count;i++) {
      doc.switchToPage(i);doc.save();doc.moveTo(48,789).lineTo(547,789).strokeColor('#d9e3dc').stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#6b7972').text(`Retrofit Pathfinder  |  Provisional brief v${snapshot.version}`,48,802,{lineBreak:false});
      doc.text(`${i+1} / ${pages.count}`,505,802,{lineBreak:false});doc.restore();
    }
    doc.end();
  });
}
