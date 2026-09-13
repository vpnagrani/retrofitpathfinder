import { id,now,audit,withLock } from './security.js';
export async function settings(db) {return Object.fromEntries((await db.query('SELECT key,value FROM settings')).map(r=>[r.key,r.value]));}
export async function purgeProfile(db,profile,actor,reason) {
  await db.transaction(async()=>{
    await db.query('DELETE FROM profiles WHERE id=?',[profile.id]);
    await audit(db,actor,'profile.purged',profile.id,{reason});
  });
}
export async function runRetention(db,actor='system') {
  return withLock(db,'retention',async()=>{
    const config=await settings(db),days=Number(config.retention_days),auditDays=Number(config.audit_retention_days);
    if(!Number.isInteger(days)||days<30||!Number.isInteger(auditDays)||auditDays<30)throw new Error('Invalid retention configuration.');
    const cutoff=new Date(Date.now()-days*86400000).toISOString();
    const expired=await db.query('SELECT id FROM profiles WHERE updated_at<?',[cutoff]);
    let count=0;
    // Recheck freshness atomically: a concurrent homeowner edit must not be purged.
    for(const p of expired)await db.transaction(async()=>{
      const removed=await db.query('DELETE FROM profiles WHERE id=? AND updated_at<? RETURNING id',[p.id,cutoff]);
      if(removed.length){count++;await audit(db,actor,'profile.purged',p.id,{reason:'retention-expired'});}
    });
    await db.query('DELETE FROM audit WHERE created_at<?',[new Date(Date.now()-auditDays*86400000).toISOString()]);
    await db.query('DELETE FROM sessions WHERE expires_at<?',[now()]);
    await db.query('DELETE FROM invites WHERE expires_at<?',[now()]);
    await db.query('DELETE FROM rate_limits WHERE expires_at<?',[now()]);
    await audit(db,actor,'retention.completed','',{purgedProfiles:count,retentionDays:days});
    await db.query("INSERT INTO settings (key,value) VALUES ('last_retention_run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify({at:now(),purged:count})]);
    return {purged:count};
  });
}
