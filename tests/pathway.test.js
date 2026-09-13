import {test} from 'node:test';
import assert from 'node:assert/strict';
import { buildPathway as build,questions } from '../server/pathway.js';
import { sampleHomes } from '../server/catalog.js';
import { profileSchema } from '../server/validation.js';
const dublin=sampleHomes[0],cork=sampleHomes[1];
const buildPathway=(p,s,o={})=>build(p,s,{asOf:Date.parse('2026-09-09'),...o});
test('both contrasting profiles validate',()=>{for(const p of sampleHomes)assert.ok(profileSchema.safeParse(p).success);});
test('every prerequisite occurs earlier in all scenarios and both homes',()=>{
  for(const p of sampleHomes)for(const scenario of ['comfort','balanced','complete']){
    const plan=buildPathway(p,scenario),ids=plan.steps.map(s=>s.id);
    for(const [i,step] of plan.steps.entries())for(const dep of step.depends)assert.ok(ids.indexOf(dep)>=0&&ids.indexOf(dep)<i,`${dep} must precede ${step.id}`);
    assert.ok(ids.indexOf('ventilation')<ids.indexOf('attic'));
  }
});
test('damp blocks fabric and traditional walls receive no automatic grant',()=>{
  const p=buildPathway(cork,'complete');assert.ok(p.steps.find(s=>s.id==='ventilation').depends.includes('moisture'));assert.equal(p.steps.find(s=>s.id==='walls').support,0);assert.ok(p.questions.some(q=>q.key==='walls'));
});
test('a BER never substitutes for a heat loss calculation',()=>{
  const p=buildPathway({...dublin,ber:'A1'},'balanced');assert.ok(p.steps.find(s=>s.id==='heat').checks.some(c=>c.includes('heat-loss')));assert.ok(p.questions.some(q=>q.key==='heat-loss'));assert.equal(p.berTarget,'Assessment needed');
});
test('unknown and prior grants suppress automatic support',()=>{for(const value of ['yes','unknown'])assert.equal(buildPathway({...dublin,priorGrants:value},'complete').support,0);});
test('ownership and MPRN gates suppress support',()=>{assert.equal(buildPathway({...dublin,ownership:'other'}).support,0);assert.equal(buildPathway({...dublin,mprn:'unknown'}).support,0);});
test('post-2020 dwellings cannot receive modelled grants',()=>{assert.equal(buildPathway({...dublin,year:2022,occupiedYear:2022},'complete').support,0);});
test('heat pump replacement does not receive decarbonisation bundle',()=>{assert.equal(buildPathway({...dublin,heating:'heatpump'}).steps.find(s=>s.id==='heat').support,0);});
test('known good attic removes unnecessary work and dependency',()=>{const p=buildPathway({...dublin,attic:'good'});assert.ok(!p.steps.some(s=>s.id==='attic'));assert.ok(!p.steps.find(s=>s.id==='heat').depends.includes('attic'));});
test('comfort excludes heating, PV is parallel to fabric after roof survey',()=>{assert.ok(!buildPathway(dublin,'comfort').steps.some(s=>['heat','solar'].includes(s.id)));assert.deepEqual(buildPathway(dublin,'complete').steps.find(s=>s.id==='solar').depends,['survey']);});
test('priced subtotal excludes unpriced work and upper net assumes no award',()=>{const p=buildPathway(dublin);assert.equal(p.total[0],p.gross[0]+p.contingency[0]);assert.equal(p.net[0],p.steps.reduce((n,s)=>n+Math.max(0,s.cost[0]-s.support),p.contingency[0]));assert.equal(p.net[1],p.total[1]);assert.equal(p.support,9300);});
test('changed source review flag withholds all numeric grants',()=>{const p=buildPathway(dublin,'complete',{suppressGrants:true});assert.equal(p.support,0);assert.ok(p.assumptions.some(a=>a.includes('withheld')));});
test('occupation before construction is rejected',()=>{assert.ok(!profileSchema.safeParse({...dublin,occupiedYear:1900}).success);});
test('catalogue expires after 90 days even if review flag is clear',()=>{assert.equal(buildPathway(dublin,'complete',{asOf:Date.parse('2027-01-01')}).support,0);});

test('published medians are not scaled by area and keep homeowner arithmetic explicit',()=>{
 const a=buildPathway({...dublin,area:60}),b=buildPathway({...dublin,area:200});
 assert.equal(a.steps.find(s=>s.id==='attic').median,2000);assert.deepEqual(a.steps.find(s=>s.id==='attic').cost,b.steps.find(s=>s.id==='attic').cost);
 assert.equal(a.funding.individual.afterGrant[0],a.steps.reduce((n,s)=>n+Math.max(0,s.cost[0]-s.support),a.contingency[0]));
 assert.equal(a.funding.oss.benchmark.homeowner,38932);assert.notEqual(a.funding.oss.benchmark.works-a.funding.oss.benchmark.grant,a.funding.oss.benchmark.homeowner);
});
test('apartment permissions gate support and shared roof measures',()=>{
 const p={...dublin,type:'apartment'};const plan=buildPathway(p,'complete');assert.equal(plan.support,0);assert.ok(!plan.steps.some(s=>['attic','solar'].includes(s.id)));
 const allowed=buildPathway({...p,managementConsent:'yes',roofAccess:'yes',roofHeatLoss:'yes'});assert.equal(allowed.steps.find(s=>s.id==='heat').support,4500);assert.equal(allowed.steps.find(s=>s.id==='attic').support,1100);
});
test('fully funded screening requires payment conditions and never promises selected upgrades',()=>{
 const p={...dublin,ownerOccupier:'yes',qualifyingPayment:'jobseeker',paymentConditions:'unknown'};
 assert.match(buildPathway(p).funding.funded.status,/More/);
 assert.match(buildPathway({...p,paymentConditions:'yes'}).funding.funded.status,/Potentially/);
 assert.match(buildPathway({...p,year:2006,occupiedYear:2006}).funding.funded.status,/Outside/);
 assert.match(buildPathway({...p,qualifyingPayment:'fuel'}).funding.funded.timing,/survey selects/);
});
test('synthetic BER provenance cannot become technical heat-loss verification',()=>{
 const p=buildPathway({...dublin,berRecordId:'DEMO-SEMI'});assert.equal(p.berEvidence.synthetic,true);assert.ok(p.questions.some(q=>q.key==='heat-loss'));
});
test('roof access alone cannot qualify a middle-floor apartment for attic insulation',()=>{
 const p={...dublin,type:'apartment',managementConsent:'yes',roofAccess:'yes',roofHeatLoss:'no'};
 assert.ok(!buildPathway(p).steps.some(s=>s.id==='attic'));
 assert.ok(buildPathway({...p,roofHeatLoss:'yes'}).steps.some(s=>s.id==='attic'));
});

test('default costs are exact SEAI medians and missing prices remain explicitly unpriced',()=>{
 const p=buildPathway(dublin);
 assert.deepEqual(p.steps.find(s=>s.id==='attic').cost,[2000,2000]);
 assert.deepEqual(p.steps.find(s=>s.id==='survey').cost,[null,null]);
 assert.deepEqual(p.steps.find(s=>s.id==='ventilation').homeownerIfApproved,[null,null]);
 assert.equal(p.costIncomplete,true);assert.deepEqual(p.contingency,[0,0]);
 assert.equal(p.gross[0],p.steps.reduce((sum,s)=>sum+(s.median||0),0));
 assert.equal(p.funding.assessment.support,350);assert.equal(p.funding.assessment.cost,null);
 assert.equal(buildPathway(dublin,'balanced',{suppressGrants:true}).funding.assessment.support,null);
});

test('legacy certificate labels remain accepted and preserved without inventing a new-scale uplift',()=>{
 const b={source:'certificate',rating:'D2',issuedOn:'2024-06-01',primaryEnergy:280,confirmed:true,unchanged:true};
 const p={...dublin,ber:'D2',berBaseline:b};
 assert.equal(profileSchema.parse(p).berBaseline.rating,'D2');
 const result=buildPathway(p).berPotential;assert.equal(result.current.rating,'D2');assert.equal(result.current.scale,'legacy');assert.equal(result.status,'assessment-needed');
});
