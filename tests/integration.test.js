import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Database} from '../server/db.js';
import {createApp} from '../server/app.js';
import {hash,secret,id,now,passwordHash} from '../server/security.js';
import {sampleHomes,sourceCatalog} from '../server/catalog.js';
import {runRetention} from '../server/governance.js';
import {refreshSources,retrieve,indexSavedSources} from '../server/sources.js';
import {interview} from '../server/interview.js';
import PDFDocument from 'pdfkit';
let db,server,base,cookie,adminCookie,profileId,reportId;
const origin='http://localhost:3000';
const request=async(url,method='GET',data,c=cookie,extra={})=>{const r=await fetch(base+url,{method,headers:{Origin:origin,...(c?{Cookie:c}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},body:data?JSON.stringify(data):undefined});return {r,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.arrayBuffer()};};
before(async()=>{
  process.env.APP_ORIGIN=origin;delete process.env.OPENAI_API_KEY;
  db=new Database(':memory:');const built=await createApp({db,demo:true});
  server=built.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
  let result=await request('/api/demo-session','POST',{role:'homeowner'},null);cookie=result.r.headers.get('set-cookie').split(';')[0];
  result=await request('/api/demo-session','POST',{role:'admin'},null);adminCookie=result.r.headers.get('set-cookie').split(';')[0];
  profileId=(await request('/api/profiles')).body.profiles[0].id;
});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();});
test('anonymous requests are denied and mutation origin is enforced',async()=>{assert.equal((await request('/api/profiles','GET',null,null)).r.status,401);assert.equal((await request('/api/profiles','POST',sampleHomes[0],cookie,{Origin:'https://attacker.example'})).r.status,403);});
test('session cookie is HttpOnly and SameSite Strict',async()=>{const {r}=await request('/api/demo-session','POST',{role:'homeowner'},null);const c=r.headers.get('set-cookie');assert.match(c,/HttpOnly/);assert.match(c,/SameSite=Strict/i);});
test('homeowner is denied administration and direct role escalation',async()=>{assert.equal((await request('/api/admin')).r.status,403);assert.equal((await request('/api/admin/invites','POST',{email:'x@example.invalid',role:'admin'})).r.status,403);});
test('profiles update with optimistic locking and validated input',async()=>{
  const p=(await request(`/api/profiles/${profileId}`)).body;
  assert.equal((await request(`/api/profiles/${profileId}`,'PUT',{revision:p.revision,data:{...p.data,area:-1}})).r.status,400);
  assert.equal((await request(`/api/profiles/${profileId}`,'PUT',{revision:p.revision,data:{...p.data,area:120}})).r.status,200);
  assert.equal((await request(`/api/profiles/${profileId}`,'PUT',{revision:p.revision,data:p.data})).r.status,409);
});
test('certificate upload is authorised and never silently changes the home',async()=>{
  const before=(await request(`/api/profiles/${profileId}`)).body;
  const bytes=await new Promise(resolve=>{const d=new PDFDocument(),c=[];d.on('data',x=>c.push(x));d.on('end',()=>resolve(Buffer.concat(c)));d.text('Building Energy Rating Certificate\nBER rating: D\nDate of Issue: 01/06/2026\nPrimary Energy: 260 kWh/m2/year');d.end();});
  const url=base+`/api/profiles/${profileId}/ber-certificate`;
  assert.equal((await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/pdf'},body:bytes})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://invalid.example',Cookie:cookie,'Content-Type':'application/pdf'},body:bytes})).status,403);
  const response=await fetch(url,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/pdf'},body:bytes});
  assert.equal(response.status,200);assert.equal((await response.json()).candidate.primaryEnergy,260);
  assert.deepEqual((await request(`/api/profiles/${profileId}`)).body.data,before.data);
});
test('confirmed BER baseline is persisted and dwelling changes invalidate its potential',async()=>{
  const r=await request('/api/profiles','POST',{...sampleHomes[0],ber:'D',damp:'no',ventilation:'assessed',berBaseline:{source:'certificate',rating:'D',issuedOn:'2026-06-01',primaryEnergy:260,confirmed:true,unchanged:true},goal:'comfort'});
  assert.equal(r.r.status,201);assert.equal(r.body.plan.berPotential.status,'illustrative');
  const update=await request(`/api/profiles/${r.body.id}`,'PUT',{revision:r.body.revision,data:{...r.body.data,area:200}});
  assert.equal(update.r.status,200);assert.equal(update.body.plan.berPotential.status,'assessment-needed');
  assert.ok(update.body.plan.berPotential.reasons.some(r=>r.includes('Dwelling facts')));
});
test('only an explicit homeowner review may confirm or replace BER evidence',async()=>{
  const b={source:'certificate',rating:'D',issuedOn:'2026-06-01',primaryEnergy:260,confirmed:true,unchanged:true};
  const r=await request('/api/profiles','POST',{...sampleHomes[0],ber:'D',damp:'no',ventilation:'assessed',berBaseline:b,goal:'comfort'});
  const omitted={...r.body.data.berBaseline};delete omitted.fingerprint;
  const unsafe=await request(`/api/profiles/${r.body.id}`,'PUT',{revision:r.body.revision,data:{...r.body.data,area:200,berBaseline:omitted}});
  assert.equal(unsafe.r.status,400);
  const admin=await request(`/api/profiles/${r.body.id}/ber-baseline`,'POST',{revision:r.body.revision,baseline:b},adminCookie);
  assert.equal(admin.r.status,403);
  const owner=await request(`/api/profiles/${r.body.id}/ber-baseline`,'POST',{revision:r.body.revision,baseline:b});
  assert.equal(owner.r.status,200);assert.equal(owner.body.plan.berPotential.status,'illustrative');
});
test('reports persist as actual PDFs and get immutable versions',async()=>{
  const one=await request(`/api/profiles/${profileId}/reports`,'POST',{scenario:'balanced'});assert.equal(one.r.status,201);reportId=one.body.id;
  const pdf=await request(`/api/reports/${reportId}/pdf`);assert.equal(pdf.r.status,200);assert.equal(Buffer.from(pdf.body).subarray(0,4).toString(),'%PDF');
  mkdirSync('output/pdf',{recursive:true});writeFileSync('output/pdf/contractor-brief-example.pdf',Buffer.from(pdf.body));
  const two=await request(`/api/profiles/${profileId}/reports`,'POST',{scenario:'comfort'});assert.equal(two.body.version,2);
  const again=await request(`/api/reports/${reportId}/pdf`);assert.deepEqual(Buffer.from(again.body),Buffer.from(pdf.body));
  assert.equal((await request('/api/reports')).body.reports.filter(r=>r.profile_id===profileId).length,2);
});
test('report snapshots exclude raw welfare answers while retaining the screening outcome',async()=>{
  const created=await request('/api/profiles','POST',{...sampleHomes[0],ownerOccupier:'yes',qualifyingPayment:'disability',paymentConditions:'yes'});
  const report=await request(`/api/profiles/${created.body.id}/reports`,'POST',{scenario:'comfort'});
  assert.equal(report.r.status,201);
  const stored=JSON.parse((await db.one('SELECT snapshot FROM reports WHERE id=?',[report.body.id])).snapshot);
  assert.equal(Object.hasOwn(stored.profile,'qualifyingPayment'),false);
  assert.equal(Object.hasOwn(stored.profile,'paymentConditions'),false);
  assert.match(stored.plan.funding.funded.status,/Potentially/);
});

test('changing accepted BER facts detaches conflicting synthetic evidence',async()=>{
  const created=await request('/api/profiles','POST',{...sampleHomes[0],berRecordId:'DEMO-SEMI'});
  assert.equal(created.body.plan.berEvidence.id,'DEMO-SEMI');
  const updated=await request(`/api/profiles/${created.body.id}`,'PUT',{revision:created.body.revision,data:{...created.body.data,area:150}});
  assert.equal(updated.r.status,200);assert.equal(updated.body.data.berRecordId,'');assert.equal(updated.body.plan.berEvidence,null);
});

test('invitation is single use, account cannot self-select role',async()=>{
  const invite=await request('/api/admin/invites','POST',{email:'other@example.invalid',role:'homeowner'},adminCookie);
  const token=invite.body.url.split('invite=')[1];assert.ok(token);
  const reg=await request('/api/register','POST',{token,name:'Test Homeowner',password:'synthetic-password-12345',role:'admin'},null);
  assert.equal(reg.r.status,200);assert.equal(reg.body.user.role,'homeowner');
  const other=reg.r.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(`/api/profiles/${profileId}`,'GET',null,other)).r.status,404);
  assert.equal((await request(`/api/profiles/${profileId}/messages`,'GET',null,other)).r.status,404);
  assert.equal((await request(`/api/profiles/${profileId}/reports`,'POST',{scenario:'complete'},other)).r.status,404);
  assert.equal((await request(`/api/reports/${reportId}/pdf`,'GET',null,other)).r.status,404);
  assert.equal((await request('/api/register','POST',{token,name:'Replay',password:'synthetic-password-12345'},null)).r.status,400);
});
test('adviser access is assignment scoped and revocable',async()=>{
  const uid=id(),token=secret();await db.query('INSERT INTO users (id,email,name,role,password,created_at) VALUES (?,?,?,?,?,?)',[uid,'adviser@example.invalid','Test adviser','adviser','disabled',now()]);await db.query('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)',[hash(token),uid,new Date(Date.now()+100000).toISOString()]);const c=`rf_session=${token}`;
  assert.equal((await request(`/api/profiles/${profileId}`,'GET',null,c)).r.status,404);
  assert.equal((await request('/api/admin/assignments','PUT',{profileId,adviserId:uid},adminCookie)).r.status,200);
  const p=(await request(`/api/profiles/${profileId}`,'GET',null,c)).body;assert.equal(p.id,profileId);
  assert.equal((await request(`/api/profiles/${profileId}`,'PUT',{revision:p.revision,data:{...p.data,consent:true}},c)).r.status,403);
  assert.equal((await request(`/api/profiles/${profileId}/deletion`,'POST',{},c)).r.status,403);
  await request('/api/admin/assignments','PUT',{profileId,adviserId:null},adminCookie);
  assert.equal((await request(`/api/reports/${reportId}/pdf`,'GET',null,c)).r.status,404);
});
test('AI consent and missing key fail clearly without inventing a reply',async()=>{
  const noConsent=await request(`/api/profiles/${profileId}/interview`,'POST',{message:'What next?'});assert.equal(noConsent.r.status,400);
  const p=(await request(`/api/profiles/${profileId}`)).body;await request(`/api/profiles/${profileId}`,'PUT',{revision:p.revision,data:{...p.data,consent:true}});
  const noKey=await request(`/api/profiles/${profileId}/interview`,'POST',{message:'What next?'});assert.equal(noKey.r.status,503);assert.match(noKey.body.error,/key/);
  assert.equal((await request(`/api/profiles/${profileId}/messages`)).body.messages.length,0);
  const consentEvent=await db.one("SELECT detail FROM audit WHERE action='consent.updated' AND target_id=? ORDER BY created_at DESC LIMIT 1",[profileId]);
  assert.equal(JSON.parse(consentEvent.detail).enabled,true);assert.equal(JSON.parse(consentEvent.detail).noticeVersion,'privacy-2026.09.09');
});
test('keyword retrieval works with dated source identity before embeddings',async()=>{
  const result=await request('/api/sources/search','POST',{query:'attic insulation grants'});assert.equal(result.r.status,200);assert.equal(result.body.mode,'keyword');assert.ok(result.body.chunks[0].source_id);assert.ok(result.body.chunks[0].checked_at);assert.match(result.body.chunks[0].url,/seai.ie/);
  const noMatch=await request('/api/sources/search','POST',{query:'zzzznonexistent'});assert.equal(noMatch.body.chunks.length,0);
});
test('saved summaries can be embedded without pretending a fresh scrape occurred',async()=>{
  const original=global.fetch;process.env.OPENAI_API_KEY='test-key-never-transmitted';
  const before=await db.query('SELECT id,retrieved_at,checked_at,kind FROM sources ORDER BY id');
  try{global.fetch=async(url,opts)=>{
    assert.equal(url,'https://api.openai.com/v1/embeddings');const payload=JSON.parse(opts.body);
    return Response.json({data:payload.input.map((_,index)=>({index,embedding:Array.from({length:1536},(_,i)=>i===index?1:0)}))});
  };
    const result=await indexSavedSources(db);assert.equal(result.indexed,sourceCatalog.length);
    const after=await db.query('SELECT id,retrieved_at,checked_at,kind FROM sources ORDER BY id');assert.deepEqual(after,before);
  }finally{global.fetch=original;delete process.env.OPENAI_API_KEY;}
});
test('changed scraped pages are versioned, timestamped and require review; failures retain snapshots',async()=>{
  const original=global.fetch;try{
    global.fetch=async()=>new Response(`<html><main><h1>SEAI grant information</h1><p>${'Insulation grant information for homeowners. '.repeat(30)}</p></main></html>`,{headers:{'Content-Type':'text/html'}});
    const result=await refreshSources(db);assert.ok(result.every(s=>s.status==='updated'));
    assert.equal((await db.one("SELECT value FROM settings WHERE key='grant_review_required'")).value,'true');
    assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM sources')).n),sourceCatalog.length*2);
    assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM sources WHERE active=1')).n),sourceCatalog.length);
    const again=await refreshSources(db);assert.ok(again.every(s=>s.status==='unchanged'));
    global.fetch=async()=>{throw new Error('offline');};const failed=await refreshSources(db);assert.ok(failed.every(s=>s.status==='failed'));
    assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM sources WHERE active=1')).n),sourceCatalog.length);
  }finally{global.fetch=original;}
});
test('OpenAI structured interview contract keeps private name out, validates changes and citations',async()=>{
  const original=global.fetch;process.env.OPENAI_API_KEY='test-key-never-transmitted';
  try{global.fetch=async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.text.format.type,'json_schema');assert.ok(!body.input.includes('PRIVATE OWNER NAME'));assert.ok(!Object.hasOwn(JSON.parse(body.input).profile,'qualifyingPayment'));assert.ok(!Object.hasOwn(JSON.parse(body.input).profile,'paymentConditions'));const source=JSON.parse(body.input).evidence[0];return Response.json({model:'test-model',output:[{content:[{type:'output_text',text:JSON.stringify({reply:'Please confirm your wall construction.',changes:[{field:'walls',value:'solid',reason:'Explicitly stated'}],citations:[source.id,'invented-source']})}]}]});};
    const answer=await interview(db,{...sampleHomes[0],name:'PRIVATE OWNER NAME',consent:true,qualifyingPayment:'disability',paymentConditions:'yes'},[],'My walls are solid. What insulation grant applies?');assert.equal(answer.changes[0].value,'solid');assert.equal(answer.citations.length,1);
  }finally{global.fetch=original;delete process.env.OPENAI_API_KEY;}
});
test('embedding batches persist and semantic retrieval uses current source versions',async()=>{
  const original=global.fetch;process.env.OPENAI_API_KEY='test-key-never-transmitted';
  try{
    global.fetch=async(url,opts)=>{
      if(url==='https://api.openai.com/v1/embeddings'){
        const payload=JSON.parse(opts.body);assert.equal(payload.model,'text-embedding-3-small');assert.equal(payload.dimensions,1536);
        return Response.json({data:payload.input.map((text,index)=>({index,embedding:Array.from({length:1536},(_,i)=>i===0?1:0)}))});
      }
      return new Response(`<html><main><h1>SEAI grant information</h1><p>${'Insulation grant information for homeowners. '.repeat(30)}</p></main></html>`,{headers:{'Content-Type':'text/html'}});
    };
    const result=await refreshSources(db);assert.ok(result.every(r=>r.indexed>0));
    const search=await retrieve(db,'insulation');assert.equal(search.mode,'vector');assert.ok(search.chunks.length);assert.ok(search.chunks.every(c=>c.kind==='scraped'));
    const count=await db.one('SELECT COUNT(*) AS n FROM chunks WHERE embedding IS NOT NULL');assert.ok(Number(count.n)>0);
    const again=await refreshSources(db);assert.ok(again.every(r=>r.indexed===0));
  }finally{global.fetch=original;delete process.env.OPENAI_API_KEY;}
});
test('successful AI turn is persisted without silently changing the profile',async()=>{
  const original=global.fetch;process.env.OPENAI_API_KEY='test-key-never-transmitted';
  try{
    global.fetch=async(url,opts)=>{
      if(String(url).startsWith(base))return original(url,opts);
      if(url==='https://api.openai.com/v1/embeddings'){const body=JSON.parse(opts.body);return Response.json({data:body.input.map((_,index)=>({index,embedding:Array.from({length:1536},(_,i)=>i===0?1:0)}))});}
      return Response.json({model:'test-model',output:[{content:[{type:'output_text',text:JSON.stringify({reply:'You reported solid walls. Please confirm the proposed update.',changes:[{field:'walls',value:'solid',reason:'Reported by homeowner'}],citations:[]})}]}]});
    };
    const before=await db.one('SELECT data FROM profiles WHERE id=?',[profileId]);
    const result=await request(`/api/profiles/${profileId}/interview`,'POST',{message:'My walls are solid.'});assert.equal(result.r.status,200);
    const after=await db.one('SELECT data FROM profiles WHERE id=?',[profileId]);assert.equal(after.data,before.data);
    const messages=(await request(`/api/profiles/${profileId}/messages`)).body.messages;assert.equal(messages.length,2);assert.equal(messages[0].role,'user');assert.equal(messages[1].evidence.changes[0].value,'solid');
  }finally{global.fetch=original;delete process.env.OPENAI_API_KEY;}
});
test('production cannot start with demo access or local-only storage',async()=>{
  const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try{await assert.rejects(()=>createApp({db:{postgres:false},demo:false}),/Production requires/);await assert.rejects(()=>createApp({db:{postgres:true},demo:true}),/Production requires/);}finally{if(previous)process.env.NODE_ENV=previous;else delete process.env.NODE_ENV;}
});
test('retention cascades to conversations and PDFs and records an audit event',async()=>{
  const pid=id(),rid=id(),old='2020-01-01T00:00:00.000Z';await db.query('INSERT INTO profiles (id,owner_id,data,created_at,updated_at) VALUES (?,?,?,?,?)',[pid,'demo-homeowner',JSON.stringify(sampleHomes[0]),old,old]);
  await db.query('INSERT INTO reports (id,profile_id,version,snapshot,pdf,created_at) VALUES (?,?,?,?,?,?)',[rid,pid,1,'{}','cGRm',old]);
  await db.query('INSERT INTO messages (id,profile_id,role,content,evidence,created_at) VALUES (?,?,?,?,?,?)',[id(),pid,'user','test','{}',old]);
  const result=await runRetention(db);assert.equal(result.purged,1);assert.ok(!await db.one('SELECT id FROM reports WHERE id=?',[rid]));assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM messages WHERE profile_id=?',[pid])).n),0);assert.ok(await db.one("SELECT id FROM audit WHERE target_id=? AND action='profile.purged'",[pid]));
});
test('synthetic BER lookup rejects real identifiers and requires profile access',async()=>{
  assert.equal((await request('/api/profiles/'+profileId+'/ber-check','POST',{sampleMprn:'10000000001'})).r.status,400);
  assert.equal((await request('/api/profiles/'+profileId+'/ber-check','POST',{sampleMprn:'00000000003'},null)).r.status,401);
  const r=await request('/api/profiles/'+profileId+'/ber-check','POST',{sampleMprn:'00000000003'});
  assert.equal(r.r.status,200);assert.equal(r.body.record.synthetic,true);assert.equal(r.body.record.type,'apartment');
});
test('deletion requests freeze edits, can cancel, and require an administrator to fulfil',async()=>{
  assert.equal((await request(`/api/profiles/${profileId}/deletion`,'POST',{})).r.status,200);
  assert.equal((await request(`/api/profiles/${profileId}/reports`,'POST',{scenario:'balanced'})).r.status,409);
  assert.equal((await request(`/api/admin/profiles/${profileId}`,'DELETE',{},cookie)).r.status,403);
  assert.equal((await request(`/api/profiles/${profileId}/deletion`,'POST',{cancel:true})).r.status,200);
  assert.equal((await request(`/api/admin/profiles/${profileId}`,'DELETE',{},adminCookie)).r.status,400);
  await request(`/api/profiles/${profileId}/deletion`,'POST',{});
  assert.equal((await request(`/api/admin/profiles/${profileId}`,'DELETE',{},adminCookie)).r.status,200);
  assert.equal((await request(`/api/reports/${reportId}/pdf`)).r.status,404);
});
test('authentication errors do not disclose account existence',async()=>{const result=await request('/api/login','POST',{email:'missing@example.invalid',password:'incorrect'},null);assert.equal(result.r.status,401);assert.equal(result.body.error,'Email or password is incorrect.');});

test('grant review cannot clear a pending BER methodology review',async()=>{
 await db.query("INSERT INTO settings (key,value) VALUES ('ber_review_required','true') ON CONFLICT(key) DO UPDATE SET value='true'");
 await request('/api/admin/sources/review','POST',{confirm:true},adminCookie);
 assert.equal((await db.one("SELECT value FROM settings WHERE key='ber_review_required'")).value,'true');
 const r=await request('/api/profiles','POST',{...sampleHomes[0],ber:'D',damp:'no',ventilation:'assessed',goal:'comfort',berBaseline:{source:'certificate',rating:'D',issuedOn:'2026-06-01',primaryEnergy:260,confirmed:true,unchanged:true}});
 assert.equal(r.body.plan.berPotential.status,'assessment-needed');
});

test('AHB applicant fields survive profile persistence and select the OSS schedule only',async()=>{
 const created=await request('/api/profiles','POST',{...sampleHomes[0],applicantType:'ahb',ahbRegistered:'yes',ownership:'owner',mprn:'yes',priorGrants:'none'});
 assert.equal(created.r.status,201);const saved=await request('/api/profiles/'+created.body.id);
 assert.equal(saved.body.data.applicantType,'ahb');assert.equal(saved.body.data.ahbRegistered,'yes');
 assert.equal(saved.body.plan.funding.breakdowns.oss.rows.find(x=>x.id==='attic').publishedGrant,1900);
 assert.equal(saved.body.plan.funding.breakdowns.beh.rows.find(x=>x.id==='attic').publishedGrant,1500);
});
