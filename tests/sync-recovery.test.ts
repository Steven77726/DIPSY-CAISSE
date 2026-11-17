import 'fake-indexeddb/auto';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {emptySnapshot} from '../src/lib/domain';

const mock=vi.hoisted(()=>({sends:[] as any[],committed:new Set<string>(),error:null as any,loseReply:false,applyGate:null as Promise<void>|null,readGate:null as Promise<void>|null,reads:0,snapshot:null as any}));
vi.mock('../src/lib/supabase',()=>{
 const client={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null}})},channel:()=>({on(){return this;},subscribe(cb:any){cb('SUBSCRIBED');return this;},unsubscribe(){}}),rpc:(name:string,args?:any)=>({abortSignal:async()=>{
  if(name==='caisse_public_access')return {data:true,error:null};
  if(name==='caisse_snapshot'){mock.reads++;await mock.readGate;return {data:mock.snapshot,error:null};}
  const op=args.op;mock.sends.push(op);await mock.applyGate;
  if(mock.error)return {data:null,error:mock.error};
  mock.committed.add(op.id);
  if(mock.loseReply){mock.loseReply=false;return {data:null,error:{message:'Failed to fetch'}};}
  return {data:{id:op.entityId,version:2},error:null};
 }})};return {supabase:client,publicSupabase:client};
});
beforeEach(()=>{
 vi.resetModules();mock.sends=[];mock.committed=new Set();mock.error=null;mock.loseReply=false;mock.applyGate=null;mock.readGate=null;mock.reads=0;mock.snapshot={...emptySnapshot(),server_time:new Date().toISOString()};
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));vi.stubGlobal('location',{search:''});vi.stubGlobal('navigator',{onLine:true});
 const memory=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)});
 vi.spyOn(globalThis,'setInterval').mockImplementation((()=>0) as any);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function ready(){const engine=await import('../src/lib/engine');engine.startEngine();await vi.waitFor(()=>expect(engine.getEngine().connection).toBe('connected'));await engine.flush();return engine;}

it('un refus explicite reste visible après actualisation, puis est archivé pour débloquer le ticket',async()=>{
 const engine=await ready();mock.error={code:'P0001',message:'RESERVATION_USE_BRIDGE'};
 await expect(engine.submit('save_order','order-refused',0,{client_id:'linked-client',lines:[{id:'line',quantity:2}]})).rejects.toThrow('réservation liée');
 const op=engine.getEngine().pending[0];expect(op.status).toBe('failed');await engine.refresh();expect(engine.getEngine().connection).toBe('error');expect(engine.getEngine().error).toContain('réservation liée');
 const archived=vi.fn();await engine.dismissOperation(op.id,archived);expect(archived).toHaveBeenCalledOnce();expect(engine.getEngine().pending).toEqual([]);
 const storage=await import('../src/lib/storage');expect(await storage.readArchivedOperation(op.actor,op.id)).toEqual(op);expect(await storage.readOperations(op.actor)).toEqual([]);
});
it('un conflit de version est conservé et ne réécrit pas automatiquement la commande',async()=>{
 const engine=await ready();mock.error={code:'P0001',message:'VERSION_CONFLICT'};
 await expect(engine.submit('save_order','changed-order',1,{lines:[]})).rejects.toThrow('autre appareil');expect(engine.getEngine().pending[0].status).toBe('conflict');await engine.flush();expect(mock.sends).toHaveLength(1);
});
it('un paiement dont la réponse est perdue garde son identifiant et ne peut pas être abandonné',async()=>{
 const engine=await ready();mock.loseReply=true;expect(await engine.submit('pay','order-payment',1,{payments:[{id:'payment-original',method:'card',amount_cents:4900}]})).toBe('queued');
 const op=engine.getEngine().pending[0];await expect(engine.dismissOperation(op.id)).rejects.toThrow('ne peut pas être supprimée');await engine.flush();expect(mock.sends.map(x=>x.id)).toEqual([op.id,op.id]);expect(mock.committed.size).toBe(1);expect(engine.getEngine().pending).toHaveLength(0);
});
it('une seconde commande soumise pendant un envoi est aussi confirmée sans attendre le minuteur',async()=>{
 const engine=await ready();let release!:()=>void;mock.applyGate=new Promise<void>(resolve=>release=resolve);
 const first=engine.submit('save_order','first-order',0,{lines:[]});await vi.waitFor(()=>expect(mock.sends).toHaveLength(1));const second=engine.submit('save_order','second-order',0,{lines:[]});await vi.waitFor(()=>expect(engine.getEngine().pending).toHaveLength(2));release();expect(await first).toBe('confirmed');expect(await second).toBe('confirmed');expect(mock.sends.map(x=>x.entityId)).toEqual(['first-order','second-order']);
});
it('un verrou pris par un autre onglet expire sans perdre la file et peut être repris',async()=>{
 const engine=await ready();Object.assign(navigator,{locks:{request:vi.fn(async(_name:any,options:any)=>{expect(options.signal).toBeInstanceOf(AbortSignal);throw new DOMException('locked','TimeoutError');})}});
 expect(await engine.submit('save_order','locked-tab',0,{lines:[]})).toBe('queued');expect(mock.sends).toHaveLength(0);const op=engine.getEngine().pending[0];
 Object.assign(navigator,{locks:{request:async(_name:any,_options:any,run:any)=>run()}});await engine.flush();expect(mock.sends[0].id).toBe(op.id);expect(engine.getEngine().pending).toHaveLength(0);
});
it('une rafale Realtime ne prolonge pas indéfiniment la première lecture',async()=>{
 const engine=await ready();let release!:()=>void;mock.readGate=new Promise<void>(resolve=>release=resolve);const reads=mock.reads;
 const first=engine.refresh();await vi.waitFor(()=>expect(mock.reads).toBe(reads+1));const followers=Array.from({length:20},()=>engine.refresh());let releaseNext!:()=>void;mock.readGate=new Promise<void>(resolve=>releaseNext=resolve);release();
 await first;expect(mock.reads).toBe(reads+2);releaseNext();await Promise.all(followers);expect(mock.reads).toBe(reads+2);
});
it('une confirmation reçue dans un autre onglet retire l’ancienne copie avant tout renvoi',async()=>{
 const engine=await ready();Object.assign(navigator,{onLine:false});await engine.submit('pay','other-tab',1,{payments:[]});const op=engine.getEngine().pending[0];const storage=await import('../src/lib/storage');await storage.deleteOperation(op.actor,op.id);Object.assign(navigator,{onLine:true});await engine.flush();expect(mock.sends).toHaveLength(0);expect(engine.getEngine().pending).toHaveLength(0);
});
