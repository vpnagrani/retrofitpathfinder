import { applyMedianCosts,fundingRoutes,COST_DATE } from './costs.js';
import { berEvidence,reconcileBerProfile } from './ber.js';
import {estimateBerPotential} from './ber-potential.js';
import { REVIEWED_AT, RULE_VERSION } from './catalog.js';

export const money = n => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
export const range = a => !a||a.some(n=>n===null)?'Quote required':a[0]===a[1]?money(a[0]):`${money(a[0])} – ${money(a[1])}`;
export function questions(p) {
  const q=[];
  if(!p.applicantType||p.applicantType==='unknown')q.push({key:'applicantType',title:'Are you applying as a private owner, an Approved Housing Body, or a tenant?',detail:'AHBs use a different OSS grant schedule. A tenant cannot claim the AHB rate personally.'});
  if(p.applicantType==='ahb'&&p.ahbRegistered!=='yes')q.push({key:'ahbRegistered',title:'Does the AHB have valid AHBRA registration?',detail:'The OSS needs registration and confirmation that the AHB owns the property. BEH requires prior authorisation.'});
  if (p.ber==='unknown') q.push({key:'ber',title:'Do you have a BER certificate?',detail:'Record the rating and assessment date. Use the certificate primary-energy figure to review your BER baseline.'});
  if (p.damp==='unknown' || p.damp==='yes') q.push({key:'damp',title:p.damp==='yes'?'What is causing the damp?':'Have you noticed damp or condensation?',detail:'An assessor should check moisture and water ingress before insulation or airtightness works.'});
  if (p.ventilation!=='assessed') q.push({key:'ventilation',title:'Has your ventilation been assessed?',detail:'Ask for a ventilation design and combustion-safety review alongside any fabric upgrade.'});
  if (p.walls==='unknown' || p.walls==='solid') q.push({key:'walls',title:p.walls==='solid'?'Is this traditional solid-wall construction?':'What is the wall construction?',detail:'A wall survey should confirm construction, exposure and moisture behaviour before specifying insulation.'});
  if (p.priorGrants==='unknown') q.push({key:'priorGrants',title:'Has this home received grants before?',detail:'Check the MPRN grant history. Previous funding can change eligibility.'});
  if (p.mprn!=='yes') q.push({key:'mprn',title:'Does the home have an MPRN?',detail:'Confirm that an electricity meter-point number exists; do not enter the number in the interview.'});
  if (p.ownership!=='owner') q.push({key:'ownership',title:'Can the property owner approve the works?',detail:'The grant applicant and any required permissions need to be confirmed.'});
  if (!p.evidence?.includes('heat-loss')) q.push({key:'heat-loss',title:'Can an adviser confirm the heat-loss calculation?',detail:'Request a room-by-room calculation, emitter sizing and electrical assessment before choosing a heat pump.'});
  if(p.type==='apartment')q.push({key:'apartment',title:'Which parts of the building can you alter?',detail:'Confirm exposed walls, roof access, management-company consent and shared heating. Whole-building works require coordination.'});
  return q;
}
export function buildPathway(p, scenario=p.goal||'balanced', options={}) {
  const factor=Math.max(.65,Math.min(2,p.area/115));
  const scale = r => r.map(n=>Math.round(n*factor/50)*50);
  const fabricEligible=p.year<2011 && p.occupiedYear<2011;
  const renewableEligible=p.year<2021 && p.occupiedYear<2021;
  const basic=['private','ahb'].includes(p.applicantType)&&(p.applicantType!=='ahb'||p.ahbRegistered==='yes')&&p.ownership==='owner'&&p.mprn==='yes'&&p.priorGrants==='none';
  const sourceFresh=!options.suppressGrants && ((options.asOf??Date.now())-Date.parse(REVIEWED_AT)<1000*86400*90);
  const grant=(n,eligible=true)=>basic&&eligible&&sourceFresh?n:0;
  const a={semi:1500,terrace:1400,detached:2000,apartment:1100}[p.type];
  const c={semi:1300,terrace:850,detached:1800,apartment:700}[p.type];
  const e={semi:6000,terrace:3500,detached:8000,apartment:3000}[p.type];
  const steps=[];
  const add=(id,title,phase,cost,support,why,depends,checks,source=null)=>steps.push({id,title,phase,cost,support,why,depends,checks,source});
  add('survey','Assess your home before choosing upgrades','Start here',[500,1000],0,'Ask a qualified professional to check BER evidence, insulation, wall construction, moisture and heating needs before choosing upgrades. Quote required. Distinguish a standard BER, an OSS Home Energy Assessment and specialist surveys; agree the scope and avoid duplicate assessment fees. See separate €350 conditional OSS assessment support.',[],['Request a fabric and ventilation survey','Confirm grant history and obtain approval before works','Arrange a post-works BER within the project scope']);
  if (p.damp!=='no') add('moisture','Resolve moisture & building defects','Make it ready',[500,5000],0,'Insulation can conceal water ingress. Identify and resolve the cause before closing up the fabric. Obtain a separate quote; no matching SEAI median is available.',['survey'],['Qualified moisture diagnosis','Repair scope and drying-out confirmation']);
  add('ventilation','Assess ventilation and allow for any required work','Fabric first',scale([1200,3500]),0,'Have ventilation and combustion safety assessed before insulation or airtightness work. Quote required for design and any installation/commissioning; no matching SEAI median is available and replacement is not presumed. An assessment and itemised quote must establish the actual scope.',['survey',...(p.damp!=='no'?['moisture']:[])],['Ventilation design','Combustion-safety review','Airflow commissioning']);
  if(p.attic!=='good'&&(p.type!=='apartment'||(p.roofAccess==='yes'&&p.roofHeatLoss==='yes'))) add('attic','Insulate the attic','Fabric first',scale([2200,3800]),grant(a,fabricEligible),'Reduce roof heat loss early. Keep eaves ventilation, wiring clearances and moisture control in the insulation design.',['ventilation'],['Roof/attic inspection','Confirm insulation depth and suitable specification'],'attic');
  if(p.walls==='cavity') add('walls','Upgrade cavity wall insulation','Fabric first',scale([2300,4200]),grant(c,fabricEligible),'First confirm the cavity is suitable and exposure or moisture will not make filling it unsafe. A whole-surface solution is needed for support.',['ventilation'],['Borescope and exposure survey','Check existing fill and thermal bridges'],'walls');
  else if(p.walls==='solid'||p.walls==='unknown') add('walls',p.traditional==='yes'?'Design a traditional-wall strategy':'Survey & design wall insulation','Fabric first',scale([14000,26000]),grant(e,fabricEligible&&p.traditional==='no'&&p.walls!=='unknown'),'The approach depends on wall construction and moisture behaviour. A matching SEAI external-wall median is used only for confirmed non-traditional solid walls; otherwise a quote is required. This is not an instruction to install external insulation. Traditional buildings need specialist assessment and a separate eligibility check.',['ventilation'],['Specialist wall and moisture assessment','Planning/protected-structure checks','Windows, reveals and roof-edge coordination'],'walls');
  if(scenario!=='comfort') add('heat',p.heating==='heatpump'?'Assess & optimise your heat pump':'Move to low-carbon heating','Heat efficiently',p.heating==='heatpump'?[500,1500]:scale([14500,22000]),grant(12500,renewableEligible&&['gas','oil','solid','storage'].includes(p.heating)),p.heating==='heatpump'?'Review controls, commissioning and performance after fabric improvements. An existing heat pump should not automatically be replaced.':'Size the heat pump to the improved home. Fabric completion, heat-loss verification, emitter design and an electrical check are gates before installation.',['survey','ventilation',...(steps.some(s=>s.id==='attic')?['attic']:[]),...(steps.some(s=>s.id==='walls')?['walls']:[])],['Adviser confirms heat-loss suitability','Room-by-room emitter sizing','Electrical capacity and outdoor-unit assessment','Confirm each heat-pump bundle component is eligible'],'heat');
  if(scenario==='complete'&&(p.type!=='apartment'||p.roofAccess==='yes')) add('solar','Generate your own electricity','Add renewables',scale([6000,8500]),grant(1800,renewableEligible),'A 4 kWp planning example. Roof condition, shading and electrical checks determine suitability. PV can run in parallel once roof works are settled; it does not replace fabric improvements.',['survey'],['Roof structure and shading review','4 kWp capacity and electrical connection confirmation'],'solar');
  if(p.type==='apartment')for(const step of steps){step.checks.push('Management-company and shared-building permissions required');if(p.managementConsent!=='yes')step.support=0;}
  applyMedianCosts(p,steps);
  const gross=steps.reduce((s,m)=>[s[0]+m.cost[0],s[1]+m.cost[1]],[0,0]);
  const support=steps.reduce((s,m)=>s+m.support,0);
  const contingency=[0,0];
  const costIncomplete=steps.some(s=>s.cost[0]===null);
  const total=gross.map((n,i)=>n+contingency[i]);
  const net=[steps.reduce((sum,s)=>sum+Math.max(0,s.cost[0]-s.support),contingency[0]),total[1]];
  const assumptions=[
    'Matched measures use SEAI medians from 47,067 individual upgrades completed January–December 2025, checked 10 September 2026. Items without matching medians require quotations and are excluded from the priced subtotal. None is a quotation.',
    'SEAI medians are not scaled by floor area. Exact published medians are the default; no assumed percentage range or contingency is added. The priced subtotal is not a complete project budget. Ask contractors to confirm VAT, exclusions and actual scope.',
    'Support is an indicative ceiling under individual grants; the confirmed award can be zero. Net range includes the zero-grant case. Do not combine these figures with a One Stop Shop grant package.',
    'Any potential BER shown is a separate low-confidence sensitivity illustration, not a DEAP assessment or grant qualification. Bill savings and carbon reduction are not predicted.',
    ...(!sourceFresh?['Numeric support is withheld: the reviewed grant catalogue is stale or a refreshed source needs review.']:[]),
    ...(!basic?['Grant eligibility is unresolved or previous support was reported, so grant amounts are withheld pending an individual review.']:[]),
    ...(p.traditional==='yes'?['Traditional-building wall insulation is not modelled as eligible for an individual wall grant. Consult a suitably qualified specialist.']:[])
  ];
  const plan={costIncomplete,grantSourcesFresh:sourceFresh,scenario,steps,gross,contingency,total,support,net,budget:p.budget,overBudget:net[1]>p.budget,questions:questions(p),assumptions,reviewedAt:REVIEWED_AT,ruleVersion:RULE_VERSION,costBasis:'SEAI 2025 medians; partial subtotal excluding unpriced items',berTarget:'Assessment needed',generatedAt:new Date().toISOString()};
  plan.costReviewedAt=COST_DATE;plan.funding=fundingRoutes(p,plan);plan.berEvidence=berEvidence(reconcileBerProfile(p).berRecordId);plan.berPotential=estimateBerPotential(p,steps,options);return plan;
}
