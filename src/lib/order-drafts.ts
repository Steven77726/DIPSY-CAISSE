import type {Line,Order,Snapshot,Operation} from './domain';
import {readableError} from './domain';
export interface Draft {id:string;version:number;table_id:string;client_id:string;label:string;lines:Line[];status:'open'|'due';edited:boolean;revision:number;saveError?:string;submitted?:boolean;sentRevision?:number}
export interface DraftBook {selected:string;drafts:Record<string,Draft>}
export const freshDraft=(table_id=''):Draft=>({id:crypto.randomUUID(),version:0,table_id,client_id:'',label:'',lines:[],status:'open',edited:false,revision:0});
export function orderDraft(s:Snapshot,o:Order):Draft{return {id:o.id,version:o.version,table_id:o.table_id||'',client_id:o.client_id||'',label:o.label,lines:s.lines.filter(l=>l.order_id===o.id),status:o.status==='due'?'due':'open',edited:false,revision:0};}
// Rebase an acknowledgement only over the exact draft that was sent. New edits survive.
export function acknowledgeDraft(current:Draft,sent:Draft,confirmed:Draft):Draft{
 return current.revision===sent.revision?confirmed:{...current,version:confirmed.version,submitted:false};
}
export function readDraftBook(key:string,legacyKey?:string):DraftBook{
 const saved=localStorage.getItem(key);if(saved){const parsed=JSON.parse(saved);if(!parsed.drafts||!parsed.selected)throw Error('Les brouillons locaux sont illisibles. Ils ont été conservés ; rechargez après récupération de la copie locale.');return parsed;}
 const legacy=legacyKey?sessionStorage.getItem(legacyKey):null;if(legacy){const d=JSON.parse(legacy);if(d.id&&Array.isArray(d.lines))return {selected:d.id,drafts:{[d.id]:{...d,revision:d.revision||0}}};}
 const d=freshDraft();return {selected:d.id,drafts:{[d.id]:d}};
}
export function writeDraftBook(key:string,book:DraftBook){localStorage.setItem(key,JSON.stringify(book));}

// A queue entry can disappear before the post-write snapshot arrives. Keep the
// sent marker through that gap so our own acknowledgement is not a conflict.
export function reconcileDraft(draft:Draft,snapshot:Snapshot,pending:Operation[]):Draft{
 const rejected=pending.find(p=>p.entityId===draft.id&&p.kind==='save_order'&&p.status!=='queued');
 if(rejected){const saveError=readableError(rejected.error||'Cette modification doit être corrigée.');return draft.saveError===saveError&&!draft.submitted?draft:{...draft,submitted:false,saveError};}
 const order=snapshot.orders.find(o=>o.id===draft.id);
 if(!order||order.version===draft.version||pending.some(p=>p.entityId===draft.id)||draft.edited&&!draft.submitted)return draft;
 const confirmed=orderDraft(snapshot,order);
 return draft.edited?acknowledgeDraft(draft,{...draft,revision:draft.sentRevision??draft.revision},confirmed):confirmed;
}
