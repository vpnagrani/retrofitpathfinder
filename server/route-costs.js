// Current standard grant schedules checked against SEAI on 11 September 2026.
// OSS per-measure costs are shared BEH median references, not invented OSS medians.
const byType=(values,type)=>values[['detached','semi','terrace','apartment'].indexOf(type)];
export const AHB_SOURCE='https://www.seai.ie/grants/home-energy-grants/one-stop-shop/approved-housing-body';
export const OSS_SOURCE='https://www.seai.ie/grants/home-energy-grants/one-stop-shop/multiple-energy-upgrades';
export const BEH_SOURCE='https://www.seai.ie/grants/home-energy-grants/individual-grants';
export function routeBreakdown(p,steps,route,fresh){
 const ahb=p.applicantType==='ahb',oss=route==='oss';
 const source=oss?(ahb?AHB_SOURCE:OSS_SOURCE):BEH_SOURCE;
 const rows=steps.map(s=>{
  let grant=null,reason='',status='Conditional — SEAI approval required';
  const special=oss&&ahb;
  if(s.id==='attic')grant=byType(special?[2500,1900,1800,1400]:[2000,1500,1400,1100],p.type);
  if(s.id==='walls'&&p.walls==='cavity')grant=byType(special?[2300,1700,1100,900]:[1800,1300,850,700],p.type);
  if(s.id==='walls'&&p.walls==='solid'&&p.traditional==='no')grant=byType(special?[10000,8000,4500,3500]:[8000,6000,3500,3000],p.type);
  if(s.id==='heat'&&p.heating!=='heatpump'&&['gas','oil','solid','storage'].includes(p.heating))grant=p.type==='apartment'?(special?5500:4500):6500;
  if(s.id==='solar')grant=1800;
  if(s.id==='survey'&&oss){grant=350;reason='Only for a registered OSS Home Energy Assessment, once per property. Not an automatic grant for every survey.';}
  if(s.id==='ventilation')reason=oss?'Mechanical ventilation may receive '+(special?'€2,000':'€1,500')+' if specified and eligible. An assessment alone is not installation; grant not included here.':'No standard BEH grant is modelled for this ventilation assessment.';
  const referenceGrant=s.id==='ventilation'&&oss?(special?2000:1500):(grant??0);
  const referenceNote=s.id==='ventilation'&&oss?'For eligible mechanical ventilation installation; assessment alone is not covered.':grant===null?'No standard grant is listed for this proposed scope.':s.id==='survey'?'For an eligible OSS Home Energy Assessment only.':'Published schedule, subject to scheme conditions.';
  const publishedGrant=fresh?grant:null;
  const applicant=p.applicantType||'unknown';
  const cutoff=oss?2011:['heat','solar'].includes(s.id)?2021:2011;
  if(!fresh){grant=null;reason='Grant source review required before publishing rates.';status='Source review required';}
  else if(!['private','ahb'].includes(applicant)){grant=null;status=applicant==='tenant'?'Property owner must apply':'Confirm applicant type';}
  else if(ahb&&p.ahbRegistered!=='yes'){grant=null;status='Confirm valid AHBRA registration';}
  else if(p.ownership!=='owner'||p.mprn==='no'||p.year>=cutoff||p.occupiedYear>=cutoff||(p.type==='apartment'&&p.managementConsent==='no')){grant=null;status='Not modelled as eligible';}
  else if(p.priorGrants!=='none'||p.mprn!=='yes'||(p.type==='apartment'&&p.managementConsent!=='yes')){grant=null;status='Eligibility confirmation needed';}
  if(ahb&&!oss)reason+=' AHBs must obtain approval of the BEH authorisation form before applying. OSS AHB rates do not apply to BEH.';
  const median=s.median??null,net=median!==null&&grant!==null?Math.max(0,median-grant):null;
  return {referenceGrant,referenceNet:median===null?null:Math.max(0,median-referenceGrant),referenceNote,id:s.id,title:s.title,median,grant,publishedGrant,net,status,reason,source};
 });
 const priced=rows.filter(r=>r.median!==null),known=priced.filter(r=>r.net!==null);
 return {referenceCheckedAt:'2026-09-11',sourceFresh:fresh,referenceGrantSubtotal:priced.reduce((n,r)=>n+Math.min(r.referenceGrant,r.median),0),referenceNetSubtotal:priced.reduce((n,r)=>n+r.referenceNet,0),costSource:'https://www.seai.ie/sites/default/files/publications/Median-costs-of-individual-energy-upgrades.pdf',route,applicantType:p.applicantType||'unknown',source,rows,medianSubtotal:priced.reduce((n,r)=>n+r.median,0),grantSubtotal:known.reduce((n,r)=>n+Math.min(r.grant,r.median),0),netSubtotal:known.length===priced.length?known.reduce((n,r)=>n+r.net,0):null,incomplete:rows.some(r=>r.net===null),costNote:oss?'Shared SEAI BEH 2025 measure medians for comparison only — not OSS measure medians or an OSS quote. The provider must price the complete package.':'SEAI BEH / Solar PV 2025 measure medians; actual quotations vary.',conditions:'Net = max(0, median cost − applicable conditional grant), per measure. No surplus is paid to the applicant or transferred to another measure. Unknown prices or grants remain unresolved. Standard rates only; enhanced welfare/first-time-buyer rates and additional heat-pump components require individual review. OSS grants require an eligible complete package; a projected BER alone does not establish eligibility.'};
}
