import {it,expect,vi,afterEach} from 'vitest';
import {freshDraft,readDraftBook,writeDraftBook,acknowledgeDraft,reconcileDraft} from '../src/lib/order-drafts';
import {tableState} from '../src/lib/table-room';
import {emptySnapshot} from '../src/lib/domain';
afterEach(()=>vi.unstubAllGlobals());
it('changer de table et recharger conserve chaque brouillon indépendamment',()=>{const store=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)||null,setItem:(k:string,v:string)=>store.set(k,v)});const a={...freshDraft('a'),label:'Cohen',edited:true},b={...freshDraft('b'),label:'David',edited:true};const book={selected:b.id,drafts:{[a.id]:a,[b.id]:b}};writeDraftBook('book',book);expect(readDraftBook('book')).toEqual(book);expect(readDraftBook('book').drafts[a.id].label).toBe('Cohen');});
it('une confirmation tardive préserve la nouvelle saisie de la table',()=>{const sent={...freshDraft('a'),revision:2,edited:true};const current={...sent,revision:3,label:'Nouvelle saisie'};const confirmed={...sent,version:1,edited:false};expect(acknowledgeDraft(current,sent,confirmed)).toMatchObject({version:1,edited:true,label:'Nouvelle saisie'});expect(acknowledgeDraft(sent,sent,confirmed)).toEqual(confirmed);});
it('gris en préparation, vert lancé, rouge payé jusqu’à la libération explicite',()=>{const s=emptySnapshot();s.table_sessions=[{id:'service',table_id:'a',order_id:'o',version:1,launched_at:null,released_at:null,created_by:'x',created_at:'',updated_at:''}];s.orders=[{id:'o',number:1,table_id:'a',client_id:null,label:'',status:'open',version:1,created_at:'',updated_at:'',created_by:'x'}];expect(tableState(s,'a').state).toBe('free');s.table_sessions[0].launched_at='now';expect(tableState(s,'a').state).toBe('serving');s.orders[0].status='paid';s.lines=[{id:'l',order_id:'o',product_id:'p',name:'Plat',quantity:1,unit_price_cents:100,vat_bps:1000,accounting_group:'food',total_cents:100,net_cents:91}];s.payments=[{id:'pay',order_id:'o',operation_id:'op',method:'card',amount_cents:100,created_at:'',created_by:'x'}];expect(tableState(s,'a').state).toBe('settled');expect(tableState(s,'a').state).toBe('settled');s.table_sessions[0].released_at='now';expect(tableState(s,'a').state).toBe('free');expect(s.payments).toHaveLength(1);});

it('une réponse reçue avant le nouveau snapshot garde le marqueur de soumission puis confirme sans faux conflit',()=>{
 const d={...freshDraft(),version:1,edited:true,submitted:true,revision:2,sentRevision:2};const s=emptySnapshot();const order={id:d.id,number:1,table_id:null,client_id:null,label:'',status:'open' as const,version:1,created_at:'',updated_at:'',created_by:'x'};s.orders=[order];
 expect(reconcileDraft(d,s,[])).toBe(d);expect(reconcileDraft(d,s,[]).submitted).toBe(true);
 s.orders=[{...order,version:2}];expect(reconcileDraft(d,s,[])).toMatchObject({version:2,edited:false});
});
it('une confirmation tardive conserve les modifications postérieures au ticket envoyé',()=>{
 const d={...freshDraft(),version:1,edited:true,submitted:true,revision:3,sentRevision:2,label:'Saisie suivante'};const s=emptySnapshot();s.orders=[{id:d.id,number:1,table_id:null,client_id:null,label:'Ancienne saisie',status:'open',version:2,created_at:'',updated_at:'',created_by:'x'}];
 expect(reconcileDraft(d,s,[])).toMatchObject({version:2,edited:true,submitted:false,label:'Saisie suivante'});
});
