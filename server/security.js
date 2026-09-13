import { randomUUID,randomBytes,createHash,scrypt as rawScrypt,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(rawScrypt);
export const id=()=>randomUUID();
export const now=()=>new Date().toISOString();
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const secret=()=>randomBytes(32).toString('hex');
export const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function passwordHash(value) {
  const salt=secret(); return `${salt}:${(await scrypt(value,salt,64)).toString('hex')}`;
}
export async function passwordMatches(value,stored) {
  const [salt,key]=stored.split(':');
  if(!salt||!key) { await scrypt(value,'invalid-user-padding',64); return false; }
  const result=await scrypt(value,salt,64),expected=Buffer.from(key,'hex');
  return expected.length===result.length&&timingSafeEqual(result,expected);
}
export async function audit(db,user,action,target,detail={}) {
  await db.query('INSERT INTO audit (id,actor_id,action,target_id,detail,created_at) VALUES (?,?,?,?,?,?)',[id(),user||'system',action,target||'',JSON.stringify(detail),now()]);
}
export function canAccess(user,p) {return user.role==='admin'||p.owner_id===user.id||(user.role==='adviser'&&p.adviser_id===user.id);}
export async function getProfile(db,user,profileId) {
  const row=await db.one('SELECT * FROM profiles WHERE id=?',[profileId]);
  if(!row||!canAccess(user,row)) throw fail(404,'Home profile not found.');
  return {...row,data:JSON.parse(row.data)};
}
export async function withLock(db,name,fn) {
  const token=id(),expires=new Date(Date.now()+1800000).toISOString();
  const acquired=await db.transaction(async()=>{
    await db.query('DELETE FROM job_locks WHERE name=? AND expires_at<?',[name,now()]);
    return db.query('INSERT INTO job_locks (name,token,expires_at) VALUES (?,?,?) ON CONFLICT(name) DO NOTHING RETURNING name',[name,token,expires]);
  });
  if(!acquired.length) throw fail(409,'This operation is already running. Please try again shortly.');
  try{return await fn();}finally{await db.query('DELETE FROM job_locks WHERE name=? AND token=?',[name,token]);}
}
export async function quota(db,key,max,seconds) {
  const t=now();
  const row=await db.one('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<? THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<? THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING count',[hash(key),new Date(Date.now()+seconds*1000).toISOString(),t,t]);
  if(row.count>max) throw fail(429,'Too many requests. Please wait before trying again.');
}
