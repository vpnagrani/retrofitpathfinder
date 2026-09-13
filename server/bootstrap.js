// Run as a one-off operator job with credentials supplied through Secret Manager.
import { Database } from './db.js';
import { id,now,passwordHash,audit } from './security.js';
import { z } from 'zod';
const email=z.email().parse(process.env.BOOTSTRAP_ADMIN_EMAIL).toLowerCase();
const password=z.string().min(16).max(200).parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
const db=new Database();await db.init();
try{await db.transaction(async()=>{
  if(await db.one("SELECT id FROM users WHERE role='admin'"))throw new Error('An administrator already exists. Bootstrap refused.');
  const uid=id();await db.query('INSERT INTO users (id,email,name,role,password,created_at) VALUES (?,?,?,?,?,?)',[uid,email,'Administrator','admin',await passwordHash(password),now()]);await audit(db,'operator','admin.bootstrapped',uid);console.log('Administrator created. Remove bootstrap secrets from the job configuration.');
});}finally{await db.close();}
