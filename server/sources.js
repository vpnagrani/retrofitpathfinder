import { load } from 'cheerio';
import { sourceCatalog,REVIEWED_AT } from './catalog.js';
import { id,hash,now,withLock,audit,fail } from './security.js';

export const EMBEDDING_MODEL='text-embedding-3-small';
export async function openAI(endpoint,payload) {
  if(!process.env.OPENAI_API_KEY) throw fail(503,'The OpenAI key has not been configured. Your saved home profile and rule-based pathway are still available.');
  let response;
  try { response=await fetch(`https://api.openai.com/v1/${endpoint}`,{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)}); }
  catch {throw fail(502,'The AI service could not be reached. Your saved data is safe; please try again.');}
  if(!response.ok) throw fail(response.status===429?429:502,'The AI service could not complete this request. Ask your administrator to check the API configuration or quota.');
  return response.json();
}
export async function embed(texts) {
  const result=await openAI('embeddings',{model:EMBEDDING_MODEL,input:texts,dimensions:1536});
  const vectors=result.data?.sort((a,b)=>a.index-b.index).map(x=>x.embedding);
  if(vectors?.length!==texts.length||vectors.some(v=>v.length!==1536||v.some(n=>!Number.isFinite(n)))) throw fail(502,'Invalid embedding response.');
  return vectors;
}
export function chunkText(text,size=1800) {
  const chunks=[];
  for(let i=0;i<text.length;i+=size-200) chunks.push(text.slice(i,i+size));
  return chunks;
}
export async function seedSources(db) {
  for(const s of sourceCatalog) {
    if(await db.one('SELECT id FROM sources WHERE url=?',[s.url])) continue;
    const sid=id(),date=`${s.reviewedAt||REVIEWED_AT}T00:00:00.000Z`;
    await db.transaction(async()=>{
      await db.query('INSERT INTO sources (id,url,title,body,digest,retrieved_at,checked_at,kind,active) VALUES (?,?,?,?,?,?,?,?,1)',[sid,s.url,s.title,s.summary,hash(s.summary),date,date,'reviewed-summary']);
      await db.query('INSERT INTO chunks (id,source_id,body) VALUES (?,?,?)',[id(),sid,s.summary]);
    });
  }
}
export async function listSources(db) {
  return db.query('SELECT s.id,s.url,s.title,s.digest,s.retrieved_at,s.checked_at,s.kind,s.active,COUNT(c.id) AS chunks,COUNT(c.embedding) AS embedded_chunks FROM sources s LEFT JOIN chunks c ON c.source_id=s.id GROUP BY s.id,s.url,s.title,s.digest,s.retrieved_at,s.checked_at,s.kind,s.active ORDER BY s.active DESC,s.title,s.retrieved_at DESC');
}
export async function indexSavedSources(db,actor='system') {
  if(!process.env.OPENAI_API_KEY)throw fail(503,'Configure the OpenAI key before indexing saved evidence.');
  return withLock(db,'source-index',async()=>{
    const missing=await db.query('SELECT c.id,c.body FROM chunks c JOIN sources s ON s.id=c.source_id WHERE s.active=1 AND c.embedding IS NULL');
    let indexed=0;
    for(let i=0;i<missing.length;i+=12){
      const batch=missing.slice(i,i+12),vectors=await embed(batch.map(c=>c.body));
      for(let j=0;j<batch.length;j++){await db.query('UPDATE chunks SET embedding=?,model=? WHERE id=?',[JSON.stringify(vectors[j]),EMBEDDING_MODEL,batch[j].id]);indexed++;}
    }
    await audit(db,actor,'sources.indexed','',{indexed,model:EMBEDDING_MODEL});
    return {indexed};
  });
}
async function fetchSource(url) {
  // Exact allowlist, no redirects and bounded reads: there is no user-controlled URL fetch.
  if(!sourceCatalog.some(s=>s.url===url)) throw fail(400,'Source URL is not allowlisted.');
  const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'RetrofitPathfinder/0.1 (+evidence retrieval; low frequency)','Accept':'text/html'}});
  if(!res.ok) throw Object.assign(new Error('Source request refused.'),{code:`HTTP_${res.status}`});
  if(!res.headers.get('content-type')?.includes('text/html')) throw Object.assign(new Error('Unexpected source type.'),{code:'CONTENT_TYPE'});
  const reader=res.body.getReader(); let size=0; const buffers=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new Error('Source exceeded size limit.');buffers.push(value);}}finally{await reader.cancel();}
  const $=load(Buffer.concat(buffers).toString('utf8'));
  $('script,style,nav,footer,header,iframe,noscript,form').remove();
  let main=$('main').first();if(!main.length)main=$('article').first();if(!main.length)main=$('body');
  main.find('p,li,h1,h2,h3,h4,tr').append('\n');
  const body=main.text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,65000);
  if(body.length<500||!(/grant|\bBER\b|\bDEAP\b/i.test(body))) throw new Error('No usable energy guidance content was found.');
  return body;
}
export async function refreshSources(db,actor='system',sourceKeys=null) {
  return withLock(db,'source-refresh',async()=>{
    const results=[];
    for(const s of sourceCatalog.filter(s=>!sourceKeys||sourceKeys.includes(s.key))) {
      try {
        const body=await fetchSource(s.url),digest=hash(body),t=now();
        const previous=await db.one('SELECT * FROM sources WHERE url=? AND active=1',[s.url]);
        let sid=previous?.id;
        if(previous?.digest!==digest) {
          sid=id();
          await db.transaction(async()=>{
            await db.query('UPDATE sources SET active=0 WHERE url=?',[s.url]);
            await db.query('INSERT INTO sources (id,url,title,body,digest,retrieved_at,checked_at,kind,active) VALUES (?,?,?,?,?,?,?,?,1)',[sid,s.url,s.title,body,digest,t,t,'scraped']);
            for(const text of chunkText(body)) await db.query('INSERT INTO chunks (id,source_id,body) VALUES (?,?,?)',[id(),sid,text]);
            await db.query("INSERT INTO settings (key,value) VALUES (?,'true') ON CONFLICT(key) DO UPDATE SET value='true'",[s.key.startsWith('ber-')?'ber_review_required':'grant_review_required']);
          });
        } else await db.query('UPDATE sources SET checked_at=? WHERE id=?',[t,sid]);
        let indexed=0,indexError=null;
        if(process.env.OPENAI_API_KEY) {
          const missing=await db.query('SELECT id,body FROM chunks WHERE source_id=? AND embedding IS NULL',[sid]);
          try {for(let i=0;i<missing.length;i+=12) {
            const batch=missing.slice(i,i+12),vectors=await embed(batch.map(c=>c.body));
            for(let j=0;j<batch.length;j++) {await db.query('UPDATE chunks SET embedding=?,model=? WHERE id=?',[JSON.stringify(vectors[j]),EMBEDDING_MODEL,batch[j].id]);indexed++;}
          }} catch {indexError='Scrape saved; embedding failed. Retry refresh to index missing chunks.';}
        }
        results.push({title:s.title,status:previous?.digest===digest?'unchanged':'updated',indexed,indexError,embeddingStatus:process.env.OPENAI_API_KEY?'configured':'awaiting API key'});
        await audit(db,actor,'source.refreshed',sid,{changed:previous?.digest!==digest,indexed});
      } catch (error) {results.push({title:s.title,status:'failed',code:error.cause?.code||error.code||'FETCH_FAILED',error:'Could not fetch usable source content; the previous snapshot is retained.'});}
    }
    await db.query("INSERT INTO settings (key,value) VALUES ('last_source_refresh',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify({at:now(),results})]);
    return results;
  });
}
function cosine(a,b) {let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return dot/Math.sqrt(aa*bb)||0;}
export async function retrieve(db,query) {
  const embedded=await db.one('SELECT COUNT(*) AS n FROM chunks c JOIN sources s ON s.id=c.source_id WHERE s.active=1 AND c.embedding IS NOT NULL');
  let rows,mode='keyword';
  if(Number(embedded.n)>0&&process.env.OPENAI_API_KEY) {
    const [v]=await embed([query]);mode='vector';
    if(db.postgres) rows=await db.query('SELECT c.id,c.body,s.id AS source_id,s.url,s.title,s.retrieved_at,s.checked_at,s.kind,1-(c.embedding <=> ?::vector) AS score FROM chunks c JOIN sources s ON s.id=c.source_id WHERE s.active=1 AND c.embedding IS NOT NULL ORDER BY c.embedding <=> ?::vector LIMIT 5',[JSON.stringify(v),JSON.stringify(v)]);
    else rows=(await db.query('SELECT c.*,s.url,s.title,s.retrieved_at,s.checked_at,s.kind FROM chunks c JOIN sources s ON s.id=c.source_id WHERE s.active=1 AND c.embedding IS NOT NULL')).map(c=>({...c,score:cosine(v,JSON.parse(c.embedding))})).sort((a,b)=>b.score-a.score).slice(0,5);
  } else {
    const words=query.toLowerCase().match(/[a-z]{3,}/g)||[];
    rows=(await db.query('SELECT c.id,c.body,c.source_id,s.url,s.title,s.retrieved_at,s.checked_at,s.kind FROM chunks c JOIN sources s ON s.id=c.source_id WHERE s.active=1')).map(c=>({...c,score:words.reduce((n,w)=>n+(c.body.toLowerCase().includes(w)?1:0),0)})).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
  }
  return {mode,chunks:rows.map(({embedding,...r})=>r)};
}
