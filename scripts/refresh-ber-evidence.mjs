import {Database} from '../server/db.js';
import {seedSources,refreshSources} from '../server/sources.js';
const db=new Database();await db.init();await seedSources(db);
try{console.log(JSON.stringify(await refreshSources(db,'system:ber-source-check',['ber-scale','ber-method','ber-fabric'])));}finally{await db.close();}
