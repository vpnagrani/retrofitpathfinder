import test from 'node:test';import assert from 'node:assert/strict';
import {routeBreakdown} from '../server/route-costs.js';
const p={type:'semi',applicantType:'unknown',ownership:'owner',year:1985,occupiedYear:1985,priorGrants:'unknown',mprn:'unknown',walls:'cavity',heating:'gas'};
test('published reference rates stay visible while personal eligibility remains unresolved',()=>{
 for(const fresh of [true,false]){const r=routeBreakdown(p,[{id:'attic',median:2000}],'beh',fresh);assert.equal(r.rows[0].referenceGrant,1500);assert.equal(r.rows[0].referenceNet,500);assert.equal(r.rows[0].grant,null);assert.equal(r.referenceNetSubtotal,500);}
});
test('reference net is zero at equal or higher grant and unknown price remains unknown',()=>{
 const r=routeBreakdown({...p,applicantType:'ahb'},[{id:'walls',median:1550},{id:'survey'}],'oss',true);
 assert.equal(r.rows[0].referenceGrant,1700);assert.equal(r.rows[0].referenceNet,0);assert.equal(r.rows[1].referenceGrant,350);assert.equal(r.rows[1].referenceNet,null);
});
test('ventilation distinguishes an OSS installation rate from an assessment fee',()=>{
 const a=routeBreakdown(p,[{id:'ventilation'}],'oss',true).rows[0];assert.equal(a.referenceGrant,1500);assert.equal(a.grant,null);assert.equal(a.referenceNet,null);
 assert.equal(routeBreakdown(p,[{id:'ventilation'}],'beh',true).rows[0].referenceGrant,0);
});
