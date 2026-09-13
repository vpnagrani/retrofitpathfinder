import { createApp } from './app.js';
const {app,db}=await createApp();
const port=Number(process.env.PORT||3000);
const host=process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1';
const server=app.listen(port,host,()=>console.log(`Retrofit Pathfinder running at http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
