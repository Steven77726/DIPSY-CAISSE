import type {Line,Order,Snapshot} from './domain';
export interface Draft {id:string;version:number;table_id:string;client_id:string;label:string;lines:Line[];status:'open'|'due';edited:boolean;revision:number;submitted?:boolean;sentRevision?:number}
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
