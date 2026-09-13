import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rating2026,estimateBerPotential} from '../server/ber-potential.js';
const home={type:'semi',year:1985,area:115,ber:'D',heating:'gas',walls:'cavity',attic:'partial',damp:'no',ventilation:'assessed',traditional:'no',evidence:['heat-loss','roof'],berBaseline:{source:'certificate',issuedOn:'2026-06-10',rating:'D',primaryEnergy:260,confirmed:true,unchanged:true}};
const steps=[{id:'survey'},{id:'ventilation'},{id:'attic'},{id:'walls'}];
const options={asOf:Date.parse('2026-09-11')};
test('2026 thresholds use revised lower bands and never infer A0',()=>{
 for(const [energy,want] of [[0,'A'],[42,'A'],[75,'A'],[75.01,'B'],[150,'B'],[225,'C'],[275,'D'],[325,'E'],[375,'F'],[375.01,'G']])assert.equal(rating2026(energy),want);
});
test('missing, legacy, expired and incompatible baselines abstain',()=>{
 for(const change of [null,{...home.berBaseline,primaryEnergy:null},{...home.berBaseline,issuedOn:'2025-01-01'},{...home.berBaseline,issuedOn:'2010-01-01'},{...home.berBaseline,issuedOn:'2027-01-01'},{...home.berBaseline,rating:'A'},{...home.berBaseline,confirmed:false},{...home.berBaseline,unchanged:false}])assert.equal(estimateBerPotential({...home,berBaseline:change},steps,options).status,'assessment-needed');
});
test('each supported scenario gets a reproducible range including no improvement',()=>{
 const fabric=estimateBerPotential(home,steps,options),heat=estimateBerPotential(home,[...steps,{id:'heat'}],options),solar=estimateBerPotential(home,[...steps,{id:'heat'},{id:'solar'}],options);
 assert.equal(fabric.status,'illustrative');assert.ok(fabric.energyRange[1]>=260);assert.ok(fabric.energyRange[0]>heat.energyRange[0]);assert.ok(heat.energyRange[0]>solar.energyRange[0]);assert.equal(fabric.current.rating,'D');assert.match(fabric.assumptions.join(' '),/not SEAI/);
});
test('unsafe or unverified upgrade scope abstains rather than promising uplift',()=>{
 for(const p of [{...home,damp:'yes'},{...home,walls:'unknown'},{...home,ventilation:'unknown'},{...home,evidence:[]},{...home,type:'apartment',managementConsent:'unknown'}])assert.equal(estimateBerPotential(p,[...steps,{id:'heat'}],options).status,'assessment-needed');
 assert.equal(estimateBerPotential(home,steps,{...options,suppressGrants:true}).status,'assessment-needed');
});
test('reviewed fresh BER sources restore estimation after the initial review date expires',()=>{
 const later={asOf:Date.parse('2027-01-01')};
 assert.equal(estimateBerPotential(home,steps,later).status,'assessment-needed');
 assert.equal(estimateBerPotential(home,steps,{...later,berSourceCheckedAt:'2026-12-31'}).status,'illustrative');
});
