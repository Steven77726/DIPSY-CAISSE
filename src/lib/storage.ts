import type {Operation,Snapshot} from './domain';
const databases=new Map<string,Promise<IDBDatabase>>();
function open(user:string){if(!databases.has(user))databases.set(user,new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(`dipsy-caisse-v1-${user}`,1);r.onupgradeneeded=()=>{r.result.createObjectStore('operations',{keyPath:'id'});r.result.createObjectStore('cache');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Le stockage local est bloqué. Fermez les autres onglets puis réessayez.'));}));return databases.get(user)!;}
async function transaction<T>(user:string,store:string,mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await open(user);return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let value:T;const r=run(tx.objectStore(store));r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Écriture locale interrompue'));});}
export const readOperations=(user:string)=>transaction<Operation[]>(user,'operations','readonly',s=>s.getAll());
export const saveOperation=(user:string,op:Operation)=>transaction(user,'operations','readwrite',s=>s.put(op));
export const deleteOperation=(user:string,id:string)=>transaction(user,'operations','readwrite',s=>s.delete(id));
export const readCache=(user:string)=>transaction<Snapshot|undefined>(user,'cache','readonly',s=>s.get('snapshot'));
export const saveCache=(user:string,snapshot:Snapshot)=>transaction(user,'cache','readwrite',s=>s.put(snapshot,'snapshot'));
export const clearCache=(user:string)=>transaction(user,'cache','readwrite',s=>s.clear());

// Archive a definite rejection and remove it from the active queue atomically.
// Unknown/queued operations are never eligible for this recovery path.
export async function archiveOperation(user:string,op:Operation){
 if(op.status==='queued')throw new Error('Une opération sans confirmation doit être vérifiée avant de reprendre.');
 const db=await open(user);await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['operations','cache'],'readwrite');
  tx.objectStore('cache').put(op,`rejected:${op.id}`);tx.objectStore('operations').delete(op.id);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export const readArchivedOperation=(user:string,id:string)=>transaction<Operation|undefined>(user,'cache','readonly',s=>s.get(`rejected:${id}`));
