import { Database } from './db.js';
import { runRetention } from './governance.js';
import { refreshSources,seedSources } from './sources.js';
const db=new Database();await db.init();
try {
  const mode=process.argv[2]||'all';
  if(mode==='all'||mode==='sources'){await seedSources(db);const results=await refreshSources(db);console.log(JSON.stringify({job:'sources',results}));if(results.some(r=>r.status==='failed'||r.indexError))process.exitCode=1;}
  if(mode==='all'||mode==='retention')console.log(JSON.stringify({job:'retention',...await runRetention(db)}));
}finally{await db.close();}
