import express from 'express';
import { berRecords,berEvidence,reconcileBerProfile } from './ber.js';
import {extractCertificate} from './ber-certificate.js';
import {BER_METHOD_VERSION,dwellingFingerprint} from './ber-potential.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Database } from './db.js';
import { audit,now,id,hash,secret,fail,passwordHash,passwordMatches,getProfile,quota,withLock } from './security.js';
import { berBaselineSchema,profileSchema,scenarioSchema,roleSchema } from './validation.js';
import { sourceCatalog,sampleHomes,REVIEWED_AT } from './catalog.js';
import { buildPathway } from './pathway.js';
import { seedSources,listSources,refreshSources,retrieve,indexSavedSources } from './sources.js';
import { interview,PROMPT_VERSION } from './interview.js';
import { makePDF } from './pdf.js';
import { settings,runRetention,purgeProfile } from './governance.js';

export async function createApp({db=new Database(),demo=process.env.DEMO_MODE==='true'}={}) {
  const production=process.env.NODE_ENV==='production';
  if(production&&(demo||!db.postgres||!process.env.APP_ORIGIN?.startsWith('https://')))throw new Error('Production requires PostgreSQL, an HTTPS APP_ORIGIN and DEMO_MODE=false.');
  await db.init();await seedSources(db);
  const app=express();app.disable('x-powered-by');if(production)app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:production?[]:null}},hsts:production?undefined:false}));
  app.use(express.json({limit:'32kb'}));
  app.use('/api',rateLimit({windowMs:60000,limit:200,standardHeaders:'draft-8',legacyHeaders:false}));
  app.use('/api',(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const expected=process.env.APP_ORIGIN||`http://localhost:${process.env.PORT||3000}`;
      if(req.get('origin')!==expected) return next(fail(403,'Request origin is not allowed.'));
    }
    next();
  });
  const publicUser=u=>({id:u.id,email:u.email,name:u.name,role:u.role});
  async function session(res,user) {
    const token=secret();await db.query('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)',[hash(token),user.id,new Date(Date.now()+8*3600000).toISOString()]);
    res.cookie('rf_session',token,{httpOnly:true,sameSite:'strict',secure:production,maxAge:8*3600000,path:'/'});
    await audit(db,user.id,'session.started',user.id);
    return publicUser(user);
  }
  async function readUser(req) {
    const token=req.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('rf_session='))?.slice(11);
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    return db.one('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?',[hash(token),now()]);
  }
  app.get('/api/health',async(req,res)=>{await db.one('SELECT 1 AS ok');res.json({ok:true});});
  app.get('/api/session',async(req,res)=>{
    const user=await readUser(req);
    const config=await settings(db);
    res.json({user:user?publicUser(user):null,demo,aiConfigured:Boolean(process.env.OPENAI_API_KEY),storage:db.postgres?'PostgreSQL + pgvector':'Local SQLite',retentionDays:Number(config.retention_days),auditRetentionDays:Number(config.audit_retention_days)});
  });
  app.post('/api/login',async(req,res)=>{
    await quota(db,`login-ip:${req.ip}`,30,900);
    const {email,password}=z.object({email:z.email().max(180),password:z.string().max(200)}).parse(req.body);
    await quota(db,`login-email:${email.toLowerCase()}`,10,900);
    const user=await db.one('SELECT * FROM users WHERE email=?',[email.toLowerCase()]);
    if(!await passwordMatches(password,user?.password||'invalid'))throw fail(401,'Email or password is incorrect.');
    res.json({user:await session(res,user)});
  });
  app.post('/api/register',async(req,res)=>{
    await quota(db,`register:${req.ip}`,10,3600);
    const v=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().trim().min(1).max(80),password:z.string().min(12).max(200)}).parse(req.body);
    const pwd=await passwordHash(v.password);
    const user=await db.transaction(async()=>{
      const inv=await db.one('DELETE FROM invites WHERE token=? AND expires_at>? RETURNING *',[hash(v.token),now()]);
      if(!inv)throw fail(400,'This invitation is invalid or has expired.');
      if(await db.one('SELECT id FROM users WHERE email=?',[inv.email]))throw fail(409,'This account already exists. Sign in instead.');
      const u={id:id(),email:inv.email,name:v.name,role:inv.role};
      await db.query('INSERT INTO users (id,email,name,role,password,created_at) VALUES (?,?,?,?,?,?)',[u.id,u.email,u.name,u.role,pwd,now()]);
      await audit(db,u.id,'invitation.accepted',u.id);return u;
    });
    res.json({user:await session(res,user)});
  });
  if(demo) {
    for(const [uid,name,role] of [['demo-homeowner','Aoife Murphy','homeowner'],['demo-admin','Workspace administrator','admin']]) {
      await db.query('INSERT INTO users (id,email,name,role,password,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',[uid,`${uid}@example.invalid`,name,role,'disabled',now()]);
    }
    if(!await db.one("SELECT value FROM settings WHERE key='demo_seeded'")) {
      await db.transaction(async()=>{
        for(const p of sampleHomes)await db.query('INSERT INTO profiles (id,owner_id,data,created_at,updated_at) VALUES (?,?,?,?,?)',[id(),'demo-homeowner',JSON.stringify(p),now(),now()]);
        await db.query("INSERT INTO settings (key,value) VALUES ('demo_seeded','true') ON CONFLICT(key) DO NOTHING");
      });
    }
    app.post('/api/demo-session',async(req,res)=>{
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw fail(403,'Preview access is local only.');
      const role=z.enum(['homeowner','admin']).parse(req.body.role||'homeowner');
      const user=await db.one('SELECT * FROM users WHERE id=?',[`demo-${role}`]);
      res.json({user:await session(res,user)});
    });
  }
  if(process.env.BOOTSTRAP_ADMIN_EMAIL&&process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    const email=z.email().parse(process.env.BOOTSTRAP_ADMIN_EMAIL).toLowerCase();
    if(!await db.one("SELECT id FROM users WHERE role='admin'")) {
      const password=z.string().min(16).parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
      await db.query('INSERT INTO users (id,email,name,role,password,created_at) VALUES (?,?,?,?,?,?)',[id(),email,'Administrator','admin',await passwordHash(password),now()]);
    }
  }
  app.use('/api',async(req,res,next)=>{req.user=await readUser(req);if(!req.user)throw fail(401,'Please sign in to continue.');next();});
  app.post('/api/logout',async(req,res)=>{
    const cookie=req.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('rf_session='))?.slice(11);
    if(cookie)await db.query('DELETE FROM sessions WHERE token=?',[hash(cookie)]);
    res.clearCookie('rf_session',{path:'/'});res.json({ok:true});
  });
  async function planOptions() {const s=await settings(db);const urls=sourceCatalog.filter(x=>x.key.startsWith('ber-')).map(x=>x.url),rows=(await listSources(db)).filter(x=>x.active===1&&urls.includes(x.url)),dates=rows.map(x=>Date.parse(x.checked_at));return {suppressGrants:s.grant_review_required==='true',suppressBer:s.ber_review_required==='true',berSourceCheckedAt:rows.length===urls.length&&dates.every(Number.isFinite)?new Date(Math.min(...dates)).toISOString():'invalid'};}
  async function packageProfile(p) {
    p={...p,data:reconcileBerProfile(p.data)};
    const opts=await planOptions();return {...p,plan:buildPathway(p.data,p.data.goal,opts),scenarios:['comfort','balanced','complete'].map(s=>buildPathway(p.data,s,opts))};
  }
  app.post('/api/profiles/:id/ber-check',async(req,res)=>{
    const p=await getProfile(db,req.user,req.params.id);
    const sample=z.string().max(11).parse(req.body.sampleMprn);
    const record=Object.hasOwn(berRecords,sample)?berRecords[sample]:null;if(!record)throw fail(400,'Use a displayed synthetic MPRN only. Real SEAI lookup is not connected.');
    await audit(db,req.user.id,'ber.synthetic_lookup',p.id,{fixture:record.id});
    res.json({record:berEvidence(record.id)});
  });
  app.post('/api/profiles/:id/ber-baseline',async(req,res)=>{
 const p=await getProfile(db,req.user,req.params.id);
 if(req.user.id!==p.owner_id)throw fail(403,'Only the homeowner can confirm BER evidence.');
 if(p.deletion_requested_at)throw fail(409,'Deletion is pending for this home.');
 const {revision,baseline}=z.object({revision:z.number().int().positive(),baseline:berBaselineSchema.nullable()}).parse(req.body);
 if(baseline&&(!baseline.confirmed||!baseline.unchanged))throw fail(400,'Review and confirm both evidence statements.');
 const data={...p.data,berBaseline:baseline};
 if(baseline){delete baseline.fingerprint;data.ber=baseline.rating;data.berRecordId='';baseline.fingerprint=dwellingFingerprint(data);}
 await db.transaction(async()=>{
 const updated=await db.query('UPDATE profiles SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING id',[JSON.stringify(data),now(),p.id,revision]);
 if(!updated.length)throw fail(409,'This profile changed in another session. Reload and try again.');
 await audit(db,req.user.id,baseline?'ber.baseline_confirmed':'ber.baseline_cleared',p.id,{profileRevision:revision+1});
 });res.json(await packageProfile(await getProfile(db,req.user,p.id)));
 });
  app.post('/api/profiles/:id/ber-certificate',async(req,res,next)=>{
    const p=await getProfile(db,req.user,req.params.id);
    if(p.deletion_requested_at)throw fail(409,'Deletion is pending for this home.');
    await quota(db,`certificate:${req.user.id}`,10,3600);
    if(!req.is('application/pdf'))throw fail(415,'Upload a PDF certificate.');
    req.certificateProfile=p;next();
  },express.raw({type:'application/pdf',limit:'5mb'}),async(req,res)=>{
    let result;try{result=await extractCertificate(req.body);}catch{throw fail(400,'The PDF could not be read safely. Use a certificate of up to 5 MB and 5 pages, or enter its fields manually.');}
    await getProfile(db,req.user,req.params.id);
    await audit(db,req.user.id,'ber.certificate_extracted',req.params.id,{status:result.status,pages:result.pages});
    res.json(result);
  });
  app.get('/api/profiles',async(req,res)=>{
    const u=req.user;
    const rows=u.role==='admin'?await db.query('SELECT * FROM profiles ORDER BY created_at'):await db.query('SELECT * FROM profiles WHERE owner_id=? OR adviser_id=? ORDER BY created_at',[u.id,u.id]);
    await audit(db,u.id,'profiles.viewed','',{profileIds:rows.map(p=>p.id)});
    res.json({profiles:await Promise.all(rows.map(p=>packageProfile({...p,data:JSON.parse(p.data)})))});
  });
  app.post('/api/profiles',async(req,res)=>{
    if(req.user.role!=='homeowner')throw fail(403,'Homeowners create their own profiles.');
    await quota(db,`profile-create:${req.user.id}`,20,86400);
    const data=reconcileBerProfile(profileSchema.parse({...req.body,synthetic:Boolean(berEvidence(req.body.berRecordId))})),pid=id(),t=now();
    if(data.berBaseline)data.berBaseline.fingerprint=dwellingFingerprint(data);
    await db.transaction(async()=>{
      await db.query('INSERT INTO profiles (id,owner_id,data,created_at,updated_at) VALUES (?,?,?,?,?)',[pid,req.user.id,JSON.stringify(data),t,t]);
      await audit(db,req.user.id,'profile.created',pid);
    });res.status(201).json(await packageProfile(await getProfile(db,req.user,pid)));
  });
  app.get('/api/profiles/:id',async(req,res)=>{const p=await getProfile(db,req.user,req.params.id);await audit(db,req.user.id,'profile.viewed',p.id);res.json(await packageProfile(p));});
  app.put('/api/profiles/:id',async(req,res)=>{
    const p=await getProfile(db,req.user,req.params.id);
    if(p.deletion_requested_at)throw fail(409,'This home has a pending deletion request. Cancel it before making changes.');
    const revision=z.number().int().positive().parse(req.body.revision),data=reconcileBerProfile(profileSchema.parse(req.body.data));
    if(data.berRecordId)data.synthetic=true;
    if(Object.hasOwn(req.body.data,'berBaseline')&&JSON.stringify(req.body.data.berBaseline)!==JSON.stringify(p.data.berBaseline??null))throw fail(400,'Use the homeowner BER evidence review to change the baseline.');data.berBaseline=p.data.berBaseline??null;
    if(data.consent!==p.data.consent&&req.user.id!==p.owner_id)throw fail(403,'Only the homeowner can change AI processing consent.');
    const changed=Object.keys(data).filter(k=>JSON.stringify(data[k])!==JSON.stringify(p.data[k]));
    await db.transaction(async()=>{
      const updated=await db.query('UPDATE profiles SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING id',[JSON.stringify(data),now(),p.id,revision]);
      if(!updated.length)throw fail(409,'This profile changed in another session. Reload and try again.');
      await audit(db,req.user.id,'profile.updated',p.id,{fields:changed});
      if(changed.includes('consent'))await audit(db,req.user.id,'consent.updated',p.id,{enabled:data.consent,noticeVersion:'privacy-2026.09.09',profileRevision:revision+1});
    });res.json(await packageProfile(await getProfile(db,req.user,p.id)));
  });
  app.get('/api/profiles/:id/messages',async(req,res)=>{
    await getProfile(db,req.user,req.params.id);const rows=await db.query('SELECT * FROM messages WHERE profile_id=? ORDER BY created_at,id',[req.params.id]);
    await audit(db,req.user.id,'interview.viewed',req.params.id);
    res.json({messages:rows.map(m=>({...m,evidence:JSON.parse(m.evidence)}))});
  });
  app.post('/api/profiles/:id/interview',async(req,res)=>{
    const p=await getProfile(db,req.user,req.params.id);if(p.deletion_requested_at)throw fail(409,'Deletion is pending for this home.');
    await quota(db,`ai:${req.user.id}`,40,3600);
    const text=z.string().trim().min(1).max(2500).parse(req.body.message);
    const result=await withLock(db,`interview:${p.id}`,async()=>{
      const messages=await db.query('SELECT role,content FROM messages WHERE profile_id=? ORDER BY created_at DESC LIMIT 12',[p.id]);
      const answer=await interview(db,p.data,messages.reverse(),text,await planOptions());
      const mid=id();
      await db.transaction(async()=>{
        const current=await getProfile(db,req.user,p.id);
        if(current.revision!==p.revision||current.deletion_requested_at||!current.data.consent)throw fail(409,'The home or consent changed during the interview. Retry with the current profile.');
        const t=Date.now();
        await db.query('INSERT INTO messages (id,profile_id,role,content,evidence,created_at) VALUES (?,?,?,?,?,?)',[id(),p.id,'user',text,'{}',new Date(t).toISOString()]);
        await db.query('INSERT INTO messages (id,profile_id,role,content,evidence,created_at) VALUES (?,?,?,?,?,?)',[mid,p.id,'assistant',answer.reply,JSON.stringify(answer),new Date(t+1).toISOString()]);
        await db.query('UPDATE profiles SET updated_at=? WHERE id=?',[now(),p.id]);
        await audit(db,req.user.id,'interview.completed',p.id,{model:answer.model,prompt:answer.promptVersion,sourceIds:answer.citations.map(c=>c.source_id)});
      });return {id:mid,...answer};
    });res.json(result);
  });
  app.post('/api/profiles/:id/deletion',async(req,res)=>{
    const p=await getProfile(db,req.user,req.params.id);if(p.owner_id!==req.user.id)throw fail(403,'Only the homeowner can request deletion.');
    const cancel=req.body.cancel===true;
    await db.transaction(async()=>{await db.query('UPDATE profiles SET deletion_requested_at=?,revision=revision+1 WHERE id=?',[cancel?null:now(),p.id]);await audit(db,req.user.id,cancel?'deletion.cancelled':'deletion.requested',p.id);});res.json({ok:true});
  });
  app.get('/api/reports',async(req,res)=>{
    const u=req.user;const where=u.role==='admin'?'':'WHERE p.owner_id=? OR p.adviser_id=?';
    const rows=await db.query(`SELECT r.id,r.profile_id,r.version,r.created_at,p.data FROM reports r JOIN profiles p ON p.id=r.profile_id ${where} ORDER BY r.created_at DESC`,u.role==='admin'?[]:[u.id,u.id]);
    res.json({reports:rows.map(({data,...r})=>({...r,home:JSON.parse(data).name}))});
  });
  app.post('/api/profiles/:id/reports',async(req,res)=>{
    const p=await getProfile(db,req.user,req.params.id);if(p.deletion_requested_at)throw fail(409,'Deletion is pending for this home.');
    await quota(db,`pdf:${req.user.id}`,20,3600);
    const scenario=scenarioSchema.parse(req.body.scenario||p.data.goal);
    const result=await withLock(db,`report:${p.id}`,async()=>{
      const n=await db.one('SELECT MAX(version) AS n FROM reports WHERE profile_id=?',[p.id]),version=Number(n.n||0)+1;
      const opts=await planOptions(),sources=(await listSources(db)).filter(s=>s.active===1);
      const lastInterview=await db.one("SELECT evidence FROM messages WHERE profile_id=? AND role='assistant' ORDER BY created_at DESC LIMIT 1",[p.id]);
      const {qualifyingPayment,paymentConditions,...reportProfile}=reconcileBerProfile(p.data);
      const snapshot={profile:reportProfile,profileRevision:p.revision,version,createdAt:now(),plan:buildPathway(p.data,scenario,opts),scenarios:['comfort','balanced','complete'].map(s=>buildPathway(p.data,s,opts)),sources,aiModel:lastInterview?JSON.parse(lastInterview.evidence).model:'Not used - rule-based report',promptVersion:lastInterview?JSON.parse(lastInterview.evidence).promptVersion:'Not used'};
      const pdf=await makePDF(snapshot),rid=id();
      await db.transaction(async()=>{
        const current=await getProfile(db,req.user,p.id);if(current.deletion_requested_at||current.revision!==p.revision)throw fail(409,'The home changed while generating this report. Please retry.');
        await db.query('INSERT INTO reports (id,profile_id,version,snapshot,pdf,created_at) VALUES (?,?,?,?,?,?)',[rid,p.id,version,JSON.stringify(snapshot),pdf.toString('base64'),snapshot.createdAt]);
        await db.query('UPDATE profiles SET updated_at=? WHERE id=?',[now(),p.id]);
        await audit(db,req.user.id,'report.generated',rid,{profileId:p.id,version,ruleVersion:snapshot.plan.ruleVersion});
      });return {id:rid,version};
    });res.status(201).json(result);
  });
  app.get('/api/reports/:id/pdf',async(req,res)=>{
    const r=await db.one('SELECT * FROM reports WHERE id=?',[req.params.id]);if(!r)throw fail(404,'Report not found.');
    await getProfile(db,req.user,r.profile_id);await audit(db,req.user.id,'report.viewed',r.id);
    res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename="retrofit-brief-v${r.version}.pdf"`}).send(Buffer.from(r.pdf,'base64'));
  });
  app.get('/api/sources',async(req,res)=>{const config=await settings(db);res.json({sources:await listSources(db),reviewRequired:config.grant_review_required==='true',berReviewRequired:config.ber_review_required==='true',reviewedAt:REVIEWED_AT,lastRefresh:config.last_source_refresh?JSON.parse(config.last_source_refresh):null});});
  app.post('/api/sources/search',async(req,res)=>{await quota(db,`search:${req.user.id}`,40,3600);res.json(await retrieve(db,z.string().min(2).max(500).parse(req.body.query)));});
  app.use('/api/admin',(req,res,next)=>{if(req.user.role!=='admin')throw fail(403,'Administrator access is required.');next();});
  app.get('/api/admin',async(req,res)=>res.json({settings:await settings(db),users:await db.query('SELECT id,email,name,role,created_at FROM users ORDER BY created_at'),audit:await db.query('SELECT * FROM audit ORDER BY created_at DESC LIMIT 150'),deletions:await db.query('SELECT id,owner_id,deletion_requested_at FROM profiles WHERE deletion_requested_at IS NOT NULL')}));
  app.post('/api/admin/invites',async(req,res)=>{
    const v=z.object({email:z.email().max(180),role:roleSchema}).parse(req.body);const token=secret();
    if(await db.one('SELECT id FROM users WHERE email=?',[v.email.toLowerCase()]))throw fail(409,'This person already has an account.');
    await db.query('INSERT INTO invites (token,email,role,expires_at,created_by) VALUES (?,?,?,?,?)',[hash(token),v.email.toLowerCase(),v.role,new Date(Date.now()+72*3600000).toISOString(),req.user.id]);
    await audit(db,req.user.id,'invitation.created','',{role:v.role});
    res.json({url:`${process.env.APP_ORIGIN||'http://localhost:3000'}/#invite=${token}`});
  });
  app.put('/api/admin/assignments',async(req,res)=>{
    const v=z.object({profileId:z.string(),adviserId:z.string().nullable()}).parse(req.body);await getProfile(db,req.user,v.profileId);
    if(v.adviserId&&!await db.one("SELECT id FROM users WHERE id=? AND role='adviser'",[v.adviserId]))throw fail(400,'Choose a registered adviser.');
    await db.transaction(async()=>{await db.query('UPDATE profiles SET adviser_id=? WHERE id=?',[v.adviserId,v.profileId]);await audit(db,req.user.id,'adviser.assigned',v.profileId,{adviserId:v.adviserId});});res.json({ok:true});
  });
  app.put('/api/admin/settings',async(req,res)=>{
    const v=z.object({retentionDays:z.number().int().min(30).max(3650),auditRetentionDays:z.number().int().min(30).max(3650)}).parse(req.body);
    await db.transaction(async()=>{for(const [key,value] of [['retention_days',v.retentionDays],['audit_retention_days',v.auditRetentionDays]])await db.query('UPDATE settings SET value=? WHERE key=?',[String(value),key]);await audit(db,req.user.id,'retention.configured','',v);});res.json({ok:true});
  });
  app.post('/api/admin/retention',async(req,res)=>res.json(await runRetention(db,req.user.id)));
  app.delete('/api/admin/profiles/:id',async(req,res)=>{
    const p=await getProfile(db,req.user,req.params.id);if(!p.deletion_requested_at)throw fail(400,'A homeowner deletion request is required.');
    await purgeProfile(db,p,req.user.id,'homeowner-request');res.json({ok:true});
  });
  app.post('/api/admin/sources/refresh',async(req,res)=>{await quota(db,'source-refresh',6,3600);res.json({results:await refreshSources(db,req.user.id)});});
  app.post('/api/admin/sources/index',async(req,res)=>{await quota(db,'source-index',6,3600);res.json(await indexSavedSources(db,req.user.id));});
  app.post('/api/admin/sources/ber-review',async(req,res)=>{
 if(req.body.confirm!==true||req.body.methodVersion!==BER_METHOD_VERSION)throw fail(400,'Review BER thresholds, DEAP changes and sensitivity assumptions against all active BER sources; supply the deployed method version.');
 const urls=sourceCatalog.filter(s=>s.key.startsWith('ber-')).map(s=>s.url),sources=(await listSources(db)).filter(s=>s.active===1&&urls.includes(s.url));
 if(sources.length!==urls.length)throw fail(409,'Required BER source snapshots are missing.');
 await db.transaction(async()=>{
 await db.query("INSERT INTO settings (key,value) VALUES ('ber_review_required','false') ON CONFLICT(key) DO UPDATE SET value='false'");
 await audit(db,req.user.id,'ber.methodology_reviewed','',{methodVersion:BER_METHOD_VERSION,digests:sources.map(s=>s.digest)});
 });res.json({ok:true});
 });
  app.post('/api/admin/sources/review',async(req,res)=>{
    if(req.body.confirm!==true)throw fail(400,'Confirm the catalogue values and conditions were checked against all active sources.');
    const sources=(await listSources(db)).filter(s=>s.active===1);
    await db.transaction(async()=>{
      await db.query("INSERT INTO settings (key,value) VALUES ('grant_review_required','false') ON CONFLICT(key) DO UPDATE SET value='false'");
      await audit(db,req.user.id,'grants.reviewed','',{catalogueDate:REVIEWED_AT,digests:sources.map(s=>s.digest)});
    });res.json({ok:true});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
  app.use(express.static(publicDir,{index:'index.html',maxAge:0}));
  app.use((err,req,res,next)=>{
    const status=err instanceof z.ZodError?400:err.status||500;
    if(status>=500)console.error(JSON.stringify({event:'request.failed',path:req.path,status,name:err.name}));
    res.status(status).json({error:err instanceof z.ZodError?err.issues.map(i=>`${i.path.join('.')||'Input'}: ${i.message}`).join('; '):status===500?'The request could not be completed. Please retry.':err.message});
  });
  return {app,db};
}
