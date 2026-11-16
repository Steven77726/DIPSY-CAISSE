import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {emptySnapshot} from '../src/lib/domain';
const mock=vi.hoisted(()=>({auth:null as any,sends:[] as any[],loseReply:true,committed:new Set<string>(),snapshot:null as any}));
vi.mock('../src/lib/supabase',()=>({publicSupabase:{rpc:()=>({abortSignal:async()=>({data:false,error:null})})},supabase:{auth:{onAuthStateChange:(cb:any)=>{mock.auth=cb;},signOut:async()=>({})},channel:()=>({on(){return this;},subscribe(cb:any){cb('SUBSCRIBED');return this;},unsubscribe(){}}),rpc:(name:string,args?:any)=>name==='caisse_my_role'?Promise.resolve({data:'admin',error:null}):({abortSignal:async()=>{
 if(name==='caisse_my_role')return {data:'admin',error:null};
 if(name==='caisse_snapshot')return {data:mock.snapshot,error:null};
 const op=args.op;mock.sends.push(op);mock.committed.add(op.id);
 if(mock.loseReply){mock.loseReply=false;return {data:null,error:{message:'Failed to fetch'}};}
 return {data:{id:op.entityId,version:2},error:null};
}})}}));
it('une réponse perdue conserve le paiement, qui est rejoué avec son identifiant puis confirmé',async()=>{
 const windowMock=new EventTarget();Object.assign(windowMock,{location:{search:''}});vi.stubGlobal('window',windowMock);vi.stubGlobal('location',{search:''});vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));const memory=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)});const nav={onLine:true};vi.stubGlobal('navigator',nav);mock.snapshot=emptySnapshot();
 const interval=vi.spyOn(globalThis,'setInterval').mockImplementation((()=>0) as any);
 const engine=await import('../src/lib/engine');engine.startEngine();mock.auth('SIGNED_IN',{user:{id:'sync-test',email:'test@example.test'}});
 await vi.waitFor(()=>expect(engine.getEngine().mode).toBe('live'));await vi.waitFor(()=>expect(engine.getEngine().lastSync).not.toBeUndefined());
 const result=await engine.submit('pay','order-a',1,{payments:[{id:crypto.randomUUID(),method:'card',amount_cents:500}]});
 expect(result).toBe('queued');expect(engine.getEngine().pending).toHaveLength(1);expect(engine.getEngine().data.payments).toHaveLength(0);
 const original=engine.getEngine().pending[0].id;await engine.flush();expect(mock.sends.map(op=>op.id)).toEqual([original,original]);expect(mock.committed.size).toBe(1);expect(engine.getEngine().pending).toHaveLength(0);
 nav.onLine=false;const before=mock.sends.length;expect(await engine.submit('pay','order-b',1,{payments:[{id:crypto.randomUUID(),method:'cash',amount_cents:300}]})).toBe('queued');expect(mock.sends.length).toBe(before);expect(engine.getEngine().pending).toHaveLength(1);
 nav.onLine=true;await engine.flush();expect(engine.getEngine().pending).toHaveLength(0);expect(mock.sends.length).toBe(before+1);interval.mockRestore();
});
