import { readFile } from 'node:fs/promises';
const API='https://br-old-shape-avehrcx0-attpapi.compute.c-11.us-east-1.aws.neon.tech';
const AUTH='https://ep-hidden-silence-avd49n4o.neonauth.c-11.us-east-1.aws.neon.tech/neondb/auth';
const TYPES={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/styles.css':'text/css; charset=utf-8'};
const ASSETS={
  '/':new URL('./public/index.html',import.meta.url),
  '/index.html':new URL('./public/index.html',import.meta.url),
  '/app.js':new URL('./public/app.js',import.meta.url),
  '/styles.css':new URL('./public/styles.css',import.meta.url)
};
async function asset(path){
  const url=ASSETS[path];
  if(!url) throw new Error('ASSET_NOT_FOUND');
  return readFile(url,'utf8');
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
async function apiProxy(req,u){
  if(u.pathname==='/health') return forward(req,API+u.pathname+u.search);

  const cookie=req.headers.get('cookie')||'';
  if(!cookie) return Response.json({error:'UNAUTHORIZED'},{status:401});

  const tokenResp=await fetch(AUTH+'/token',{
    method:'GET',
    headers:{cookie,'accept':'application/json'}
  });
  const tokenBody=await tokenResp.json().catch(()=>({}));
  const token=tokenBody?.token;
  if(!tokenResp.ok || !token) return Response.json({error:'UNAUTHORIZED'},{status:401});

  const headers=new Headers(req.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('cookie');
  headers.set('authorization','Bearer '+token);
  const init={method:req.method,headers,redirect:'manual'};
  if(!['GET','HEAD'].includes(req.method)) init.body=await req.arrayBuffer();

  const r=await fetch(API+u.pathname+u.search,init);
  const outHeaders=new Headers(r.headers);
  outHeaders.delete('content-encoding');
  outHeaders.delete('content-length');
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:outHeaders});
}
async function authProxy(req,u){
  const path=u.pathname==='/auth'?'':u.pathname.slice('/auth'.length);
  if (/\/sign-up(?:\/|$)/i.test(path) || /\/register(?:\/|$)/i.test(path)) {
    return Response.json({error:'SIGNUP_DISABLED'},{status:403,headers:{'cache-control':'no-store'}});
  }
  return forward(req,AUTH+path+u.search);
}
export default {async fetch(req){
  const u=new URL(req.url);
  if(u.pathname==='/health'||u.pathname.startsWith('/api/')) return apiProxy(req,u);
  if(u.pathname==='/auth'||u.pathname.startsWith('/auth/')) return authProxy(req,u);
  if(!TYPES[u.pathname]) return new Response('Not found',{status:404});
  try{return new Response(await asset(u.pathname),{headers:{'content-type':TYPES[u.pathname],'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'}})}
  catch(e){return Response.json({ok:false,error:String(e.message||e)},{status:502})}
}};
