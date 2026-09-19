const BASE='https://raw.githubusercontent.com/drngovothiennhan/Dr.Ngovothiennhan/so-attp-neon-rebuild/apps/so-attp-neon/frontend';
const API='https://br-old-shape-avehrcx0-attpapi.compute.c-11.us-east-1.aws.neon.tech';
const AUTH='https://ep-hidden-silence-avd49n4o.neonauth.c-11.us-east-1.aws.neon.tech/neondb/auth';
const TYPES={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/styles.css':'text/css; charset=utf-8'};
const cache=new Map();
async function asset(path){
  const name=path==='/'?'index.html':path.slice(1);
  const hit=cache.get(name);
  if(hit && Date.now()-hit.at<60000) return hit.body;
  const r=await fetch(`${BASE}/${name}`,{headers:{'user-agent':'attp-neon-web'}});
  if(!r.ok) throw new Error(`SOURCE_${r.status}`);
  const body=await r.text(); cache.set(name,{body,at:Date.now()}); return body;
}
async function forward(req,target){
  const headers=new Headers(req.headers);
  headers.delete('host');
  headers.delete('origin');
  const init={method:req.method,headers,redirect:'manual'};
  if(!['GET','HEAD'].includes(req.method)) init.body=await req.arrayBuffer();
  const r=await fetch(target,init);
  const outHeaders=new Headers(r.headers);
  outHeaders.delete('content-encoding');
  outHeaders.delete('content-length');
  if(typeof r.headers.getSetCookie==='function'){
    outHeaders.delete('set-cookie');
    for(const c of r.headers.getSetCookie()) outHeaders.append('set-cookie',c.replace(/Domain=[^;]+; ?/ig,''));
  }
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:outHeaders});
}
async function apiProxy(req,u){ return forward(req,API+u.pathname+u.search); }
async function authProxy(req,u){
  const path=u.pathname==='/auth'?'':u.pathname.slice('/auth'.length);
  return forward(req,AUTH+path+u.search);
}
export default {async fetch(req){
  const u=new URL(req.url);
  if(u.pathname==='/health'||u.pathname.startsWith('/api/')) return apiProxy(req,u);
  if(u.pathname==='/auth'||u.pathname.startsWith('/auth/')) return authProxy(req,u);
  if(!TYPES[u.pathname]) return new Response('Not found',{status:404});
  try{return new Response(await asset(u.pathname),{headers:{'content-type':TYPES[u.pathname],'cache-control':'public, max-age=60','x-content-type-options':'nosniff'}})}
  catch(e){return Response.json({ok:false,error:String(e.message||e)},{status:502})}
}};
