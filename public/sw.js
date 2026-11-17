const CACHE='dipsy-shell-v14';
const ROOT=self.registration.scope;
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll([ROOT,new URL('favicon.svg',ROOT).href])));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('dipsy-shell-')&&k!==CACHE).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!event.request.url.startsWith(ROOT))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(async cached=>cached||(event.request.mode==='navigate'?await caches.match(ROOT):null)||Response.error())));
});
