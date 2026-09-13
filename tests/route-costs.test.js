import test from 'node:test';import assert from 'node:assert/strict';
import {routeBreakdown} from '../server/route-costs.js';
const p={type:'semi',applicantType:'private',ownership:'owner',year:1985,occupiedYear:1985,priorGrants:'none',mprn:'yes',traditional:'no',walls:'cavity',heating:'gas'};
const steps=[{id:'attic',title:'Attic',median:2000},{id:'walls',title:'Walls',median:1550},{id:'survey',title:'Assessment'}];
test('route arithmetic deducts the grant once and floors the homeowner payment at zero',()=>{
 const r=routeBreakdown(p,[{id:'attic',median:1500}], 'beh',true);assert.equal(r.rows[0].grant,1500);assert.equal(r.rows[0].net,0);
 const a=routeBreakdown({...p,applicantType:'ahb',ahbRegistered:'yes'},steps,'oss',true);assert.equal(a.rows[0].grant,1900);assert.equal(a.rows[0].net,100);assert.equal(a.rows[1].grant,1700);assert.equal(a.rows[1].net,0);
});
test('AHB schedule is OSS-only and unconfirmed registration cannot enable higher rates',()=>{
 assert.equal(routeBreakdown({...p,applicantType:'ahb',ahbRegistered:'yes'},steps,'beh',true).rows[0].grant,1500);
 assert.equal(routeBreakdown({...p,applicantType:'ahb',ahbRegistered:'unknown'},steps,'oss',true).rows[0].grant,null);
 assert.equal(routeBreakdown({...p,applicantType:'tenant'},steps,'oss',true).rows[0].net,null);
});
test('missing prices and withheld eligibility never masquerade as zero costs or zero grants',()=>{
 assert.equal(routeBreakdown(p,steps,'oss',true).rows[2].net,null);
 assert.equal(routeBreakdown(p,steps,'beh',false).rows[0].grant,null);
 assert.equal(routeBreakdown({...p,priorGrants:'unknown'},steps,'beh',true).rows[0].status,'Eligibility confirmation needed');
 assert.equal(routeBreakdown({...p,year:2020},steps,'oss',true).rows[0].net,null);
});

test('unconfirmed applicant and grant facts withhold net figures in both routes',()=>{
 for(const route of ['beh','oss']){
  for(const patch of [{applicantType:'unknown'},{applicantType:'ahb',ahbRegistered:'no'},{applicantType:'ahb',ahbRegistered:'unknown'},{priorGrants:'unknown'},{mprn:'unknown'}])assert.equal(routeBreakdown({...p,...patch},steps,route,true).rows[0].net,null);
 }
 assert.ok(routeBreakdown(p,steps,'oss',true).costSource.endsWith('.pdf'));
});
