import {createHash} from 'node:crypto';
export const BER_METHOD_VERSION='illustrative-2026.09.11-1';
export const BER_SOURCE_DATE='2026-09-11';
export const BER_SCALE_SOURCE='https://www.seai.ie/ber/new-simplified-scale';
export const BER_THRESHOLD_SOURCE='https://www.seai.ie/sites/default/files/2026-03/sample-new-ber-certificate.pdf';
export const BER_GUIDANCE_SOURCE='https://www.seai.ie/ber/support-for-ber-assessors/deap';
export const BER_RATINGS=['A0','A','B','C','D','E','F','G','A1','A2','A3','B1','B2','B3','C1','C2','C3','D1','D2','E1','E2','unknown'];
export function rating2026(energy){
  if(!Number.isFinite(energy)||energy<0)return null;
  return [[75,'A'],[150,'B'],[225,'C'],[275,'D'],[325,'E'],[375,'F']].find(([ceiling])=>energy<=ceiling)?.[1]||'G';
}
export function dwellingFingerprint(p){return createHash('sha256').update(JSON.stringify(['type','year','occupiedYear','area','heating','walls','attic','ber'].map(k=>p[k]))).digest('hex');}
export function estimateBerPotential(p,steps,options={}){
  const b=p.berBaseline,asOf=options.asOf??Date.now(),reasons=[];
  const sourceCheckedAt=options.berSourceCheckedAt??BER_SOURCE_DATE,sourceTime=Date.parse(sourceCheckedAt);
  const current={confirmed:Boolean(b?.confirmed&&b?.unchanged),rating:b?(b.rating==='unknown'?null:b.rating):p.ber,primaryEnergy:b?.primaryEnergy??null,issuedOn:b?.issuedOn||null,source:b?.source||'reported-only',synthetic:Boolean(p.synthetic),scale:b?.issuedOn?(b.issuedOn<'2026-05-24'?'legacy':'2026'):'unknown'};
  const out={status:'assessment-needed',current,reasons,methodVersion:BER_METHOD_VERSION,sourceCheckedAt,sources:[BER_SCALE_SOURCE,BER_THRESHOLD_SOURCE,BER_GUIDANCE_SOURCE],assumptions:[],energyRange:null,ratingRange:null};
  if(!b||!b.confirmed||!b.unchanged)reasons.push('Confirm that the certificate or BER primary-energy assessment describes the home as it is today.');
  const issue=b?.issuedOn?Date.parse(b.issuedOn+'T00:00:00Z'):NaN;
  if(!Number.isFinite(issue)||issue>asOf)reasons.push('A valid issue or assessment date is required.');
  else {const expires=new Date(issue);expires.setUTCFullYear(expires.getUTCFullYear()+10);if(expires.getTime()<=asOf)reasons.push('The baseline is over ten years old; obtain a current assessment.');}
  if(b?.issuedOn<'2026-05-24')reasons.push('This legacy certificate remains displayed as issued. Updated primary-energy methodology requires an assessor to establish a 2026 baseline; relabelling is not an upgrade.');
  if(!Number.isFinite(b?.primaryEnergy)||b.primaryEnergy<=0)reasons.push('Enter primary energy per floor area in kWh/m²/year from a BER assessment. Bills, final energy and a rating letter alone are insufficient.');
  if(b?.issuedOn>='2026-05-24'&&b?.rating&&b.rating!=='unknown'&&((b.rating==='A0'&&b.primaryEnergy>42)||(b.rating!=='A0'&&rating2026(b.primaryEnergy)!==b.rating)))reasons.push('The reported rating and primary-energy figure do not match the 2026 scale. Review the certificate fields.');
  if(b?.fingerprint&&b.fingerprint!==dwellingFingerprint(p))reasons.push('Dwelling facts have changed since the baseline was confirmed. Review it again.');
  if(Number.isFinite(b?.primaryEnergy)&&b.primaryEnergy<=75)reasons.push('This home is already in the highest modelled energy band. A0 and further optimisation need a qualified assessment.');
  if(p.damp!=='no'||p.ventilation!=='assessed')reasons.push('Resolve moisture uncertainty and obtain a ventilation assessment before illustrating uplift.');
  if(p.traditional!=='no'||p.walls==='unknown')reasons.push('Confirm wall construction and specialist requirements before modelling the fabric.');
  if(p.type==='apartment'&&p.managementConsent!=='yes')reasons.push('Apartment shared-building permissions must be confirmed.');
  if(steps.some(s=>s.id==='heat')&&(!p.evidence?.includes('heat-loss')||!['gas','oil','solid','storage','heatpump'].includes(p.heating)))reasons.push('The heating scenario needs a heat-loss assessment and a known heating system.');
  if(steps.some(s=>s.id==='solar')&&!p.evidence?.includes('roof'))reasons.push('The solar scenario needs roof suitability evidence.');
  if(options.suppressBer||options.suppressGrants||!Number.isFinite(sourceTime)||sourceTime>asOf||asOf-sourceTime>90*86400000)reasons.push('The dated source rules require review before estimates can be shown.');
  if(reasons.length)return out;
  const factors={attic:p.attic==='none'?.12:.08,walls:p.walls==='cavity'?.15:.20,heat:p.heating==='heatpump'?0:.30,solar:.10};
  const used=steps.filter(s=>factors[s.id]>0);
  if(!used.length){reasons.push('No supported energy measure is included in this scenario.');return out;}
  const remaining=used.reduce((n,s)=>n*(1-factors[s.id]),1);
  const energyRange=[Math.floor(Math.max(40,b.primaryEnergy*remaining)),Math.ceil(b.primaryEnergy*1.05)];
  return {...out,status:'illustrative',energyRange,ratingRange:energyRange.map(rating2026),assumptions:[
    'Low-confidence sensitivity illustration, not a DEAP calculation or certified prediction. Coefficients are Pathfinder assumptions, not SEAI savings estimates.',
    ...used.map(s=>`${s.id}: favourable sensitivity assumes up to ${Math.round(factors[s.id]*100)}% reduction in the remaining primary-energy figure. Applied sequentially, not added.`),
    'The cautious end allows no improvement and 5% additional energy use. Actual results may lie outside this illustrative range.',
    'Assumes all selected works are suitable, completed and commissioned, with the same floor area. No energy-carrier recalculation, detailed U-value model or household bill forecast is performed.',
    '2026 thresholds classify the modelled energy range. A0 needs additional zero-emission verification and is never predicted. A projected B is not grant approval.'
  ]};
}
