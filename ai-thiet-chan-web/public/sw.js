const CACHE='ai-thiet-chan-v2.5.2';
const SHELL=['/','/styles.css','/history.css','/dual-view.css','/settings.css','/quality-dashboard.css','/app.js','/settings.js','/quality-dashboard.js','/manifest.webmanifest','/icon.svg','/open-source.html'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
  event.respondWith((async()=>{
    try{
      const response=await fetch(request,{cache:'no-cache'});
      if(response.ok){const cache=await caches.open(CACHE);cache.put(request,response.clone());}
      return response;
    }catch{
      return (await caches.match(request)) || (request.mode==='navigate' ? await caches.match('/') : Response.error());
    }
  })());
});
