export type Role = 'admin' | 'staff';
export type Category = 'entrees'|'plats'|'desserts'|'boissons'|'alcool'|'vins'|'cocktails';
export type Group = 'food'|'non_alcohol'|'alcohol';
export type Status = 'open'|'due'|'paid'|'cancelled';
export interface ProductOrder {id:string;category:Category;product_ids:string[];version:number;updated_at?:string;updated_by?:string|null}
export interface Product {reference?:string;id:string;name:string;category:Category;price_cents:number;vat_bps:number;accounting_group:Group;active:boolean;version:number}
export interface Table {id:string;label:string;seats:number;active:boolean;version:number;external_table_id?:string|null}
export interface Client {reservation_id?:string|null;id:string;name:string;phone:string;version:number;created_at:string}
export interface Order {reservation_id?:string|null;reservation_visit_date?:string|null;id:string;number:number;table_id:string|null;client_id:string|null;label:string;status:Status;version:number;created_at:string;updated_at:string;created_by:string}
export interface Line {reference?:string;id:string;order_id:string;product_id:string;name:string;quantity:number;unit_price_cents:number;vat_bps:number;accounting_group:Group;total_cents:number;net_cents:number}
export interface Payment {id:string;order_id:string;operation_id:string;method:'card'|'cash';amount_cents:number;created_at:string;created_by:string}
export interface Access {email:string;name:string;role:Role;active:boolean;version:number}
export interface AuditEvent {id:string;operation_id:string;order_id:string|null;kind:string;created_at:string;before_state:unknown;after_state:unknown}
export interface TableSession {id:string;table_id:string;order_id:string;launched_at:string|null;released_at:string|null;version:number;created_by:string;created_at:string;updated_at:string}
export interface Snapshot {product_order?:ProductOrder[];table_sessions?:TableSession[];products:Product[];tables:Table[];clients:Client[];orders:Order[];lines:Line[];payments:Payment[];access:Access[];events:AuditEvent[];server_time?:string}
export interface Operation {id:string;actor:string;deviceId?:string;kind:string;entityId:string;baseVersion:number;payload:Record<string,unknown>;status:'queued'|'conflict'|'failed';error?:string;createdAt:string}
export const emptySnapshot = ():Snapshot => ({products:[],tables:[],clients:[],orders:[],lines:[],payments:[],access:[],events:[]});
export const categories:{id:Category|'all';name:string;short:string}[]=[{id:'all',name:'Tous les produits',short:'Tout'},{id:'plats',name:'Plats',short:'Plats'},{id:'vins',name:'Vins',short:'Vins'},{id:'cocktails',name:'Cocktails',short:'Cocktails'},{id:'boissons',name:'Boissons',short:'Boissons'},{id:'alcool',name:'Alcool',short:'Alcool'}];
export const statusNames:Record<Status,string>={open:'En cours',due:'À régler',paid:'Réglée',cancelled:'Annulée'};
export const eventNames:Record<string,string>={archive_table:'Table retirée de la salle',reorder_products:'Classement des articles modifié',launch_service:'Service lancé',release_table:'Table libérée',correct_line:'Article corrigé',save_order:'Commande enregistrée',pay:'Règlement enregistré',cancel_order:'Commande annulée',save_client:'Fiche client enregistrée',save_product:'Produit mis à jour',save_table:'Table mise à jour',save_access:'Accès mis à jour'};
export const euro=(cents:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
export const decimal=(cents:number)=>(cents/100).toFixed(2).replace('.',',');
export function parseCents(input:string):number {const s=input.trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(s))return NaN;const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
export const netCents=(gross:number,vatBps:number)=>Math.round(gross*10000/(10000+vatBps));
export const parisDay=(date:string|Date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
export const time=(date:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(new Date(date));
export const dateLabel=(date:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',year:'numeric'}).format(new Date(date));
export const orderLines=(s:Snapshot,id:string)=>s.lines.filter(l=>l.order_id===id);
export const orderPayments=(s:Snapshot,id:string)=>s.payments.filter(p=>p.order_id===id);
export const orderTotal=(s:Snapshot,id:string)=>orderLines(s,id).reduce((n,l)=>n+l.total_cents,0);
export const orderPaid=(s:Snapshot,id:string)=>orderPayments(s,id).reduce((n,p)=>n+p.amount_cents,0);
export const orderBalance=(s:Snapshot,id:string)=>orderTotal(s,id)-orderPaid(s,id);
export const orderLabel=(s:Snapshot,o:Order)=>s.tables.find(t=>t.id===o.table_id)?.label||o.label||'Commande libre';
export function aggregateLines(lines:Line[]){return lines.reduce((a,l)=>({gross:a.gross+l.total_cents,net:a.net+l.net_cents,vat:a.vat+l.total_cents-l.net_cents}),{gross:0,net:0,vat:0});}
// Largest-remainder allocation conserves every cent, including partial/mixed payments.
export function apportion(amount:number,weights:number[]):number[]{
 const total=weights.reduce((n,x)=>n+x,0);if(total===0)return weights.map(()=>0);
 const parts=weights.map((w,i)=>({i,value:Math.floor(amount*w/total),fraction:amount*w%total}));
 const remainder=amount-parts.reduce((n,p)=>n+p.value,0);
 [...parts].sort((a,b)=>b.fraction-a.fraction||a.i-b.i).slice(0,remainder).forEach(p=>p.value++);
 return parts.map(p=>p.value);
}
export function paymentAllocations(s:Snapshot){
 const result:{payment:Payment;line:Line;gross:number;net:number;vat:number}[]=[];
 for(const o of s.orders){
  const lines=orderLines(s,o.id).sort((a,b)=>a.id.localeCompare(b.id));let before=lines.map(()=>0);
  for(const payment of orderPayments(s,o.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))){
   const shares=apportion(payment.amount_cents,lines.map((l,i)=>l.total_cents-before[i]));
   const after=before.map((n,i)=>n+shares[i]);
   lines.forEach((line,i)=>{const gross=after[i]-before[i];const net=netCents(after[i],line.vat_bps)-netCents(before[i],line.vat_bps);result.push({payment,line,gross,net,vat:gross-net});});before=after;
  }
 }
 return result;
}
export function accounting(s:Snapshot,start:string,end:string){
 const orders=s.orders.filter(o=>parisDay(o.created_at)>=start&&parisDay(o.created_at)<=end);
 const payments=s.payments.filter(p=>parisDay(p.created_at)>=start&&parisDay(p.created_at)<=end);
 const paymentIds=new Set(payments.map(p=>p.id));const allocations=paymentAllocations(s).filter(a=>paymentIds.has(a.payment.id));
 const sum=(items:typeof allocations)=>items.reduce((a,x)=>({gross:a.gross+x.gross,net:a.net+x.net,vat:a.vat+x.vat}),{gross:0,net:0,vat:0});
 const vats=new Map<number,{net:number;vat:number;gross:number}>();
 allocations.forEach(a=>{const prev=vats.get(a.line.vat_bps)||{net:0,vat:0,gross:0};vats.set(a.line.vat_bps,{net:prev.net+a.net,vat:prev.vat+a.vat,gross:prev.gross+a.gross});});
 const paidOrderIds=new Set(payments.map(p=>p.order_id));const sales=s.orders.filter(o=>paidOrderIds.has(o.id));
 const mixed=[...paidOrderIds].filter(id=>new Set(orderPayments(s,id).map(p=>p.method)).size>1);
 return {orders,sales,payments,allocations,vats,total:sum(allocations),food:sum(allocations.filter(a=>a.line.accounting_group==='food')),alcohol:sum(allocations.filter(a=>a.line.accounting_group==='alcohol')),drinks:sum(allocations.filter(a=>a.line.accounting_group==='non_alcohol')),card:payments.filter(p=>p.method==='card').reduce((n,p)=>n+p.amount_cents,0),cash:payments.filter(p=>p.method==='cash').reduce((n,p)=>n+p.amount_cents,0),mixedCount:mixed.length,mixedAmount:payments.filter(p=>mixed.includes(p.order_id)).reduce((n,p)=>n+p.amount_cents,0),cancelled:orders.filter(o=>o.status==='cancelled'),remaining:orders.filter(o=>o.status!=='cancelled').reduce((n,o)=>n+orderBalance(s,o.id),0)};
}
export const readableError=(message:string)=>{
 const errors:Record<string,string>={TABLE_USE_REMOVE_ACTION:'Utilisez Supprimer et confirmez en écrivant supprimer pour retirer une table.',TABLE_CONFIRMATION_REQUIRED:'Écrivez supprimer pour confirmer le retrait de cette table.',TABLE_ALREADY_REMOVED:'Cette table a déjà été retirée de la salle.',TABLE_NOT_FOUND:'Cette table n’existe plus dans la salle.',INDEPENDENT_TABLE_REQUIRED:'Cette action concerne une table propre à Dipsy Caisse.',PRODUCT_LIST_CHANGED:'La carte a changé sur un autre appareil. Actualisez-la avant de modifier le classement.',INVALID_PRODUCT_ORDER:'Ce classement ne correspond plus aux articles de la catégorie. Actualisez la carte.',PRODUCT_ORDER_NOT_FOUND:'Actualisez la caisse pour charger le classement partagé.',caisse_tables_label_key:'Une table porte déjà ce nom. Choisissez un autre nom.',TABLE_UNAVAILABLE:'Cette table n’est plus disponible.',TABLE_BUSY:'Une commande existe déjà sur cette table. Chargez la version serveur pour la retrouver.',TABLE_NOT_SETTLED:'La table doit être intégralement payée avant sa libération.',TABLE_ALREADY_RELEASED:'Cette table a déjà été libérée. Sélectionnez-la pour commencer un nouveau ticket.',TABLE_ORDER_MOVE_BLOCKED:'Cette commande reste attachée à sa table. Sélectionnez une autre table pour ouvrir son propre ticket.',TABLE_OCCUPIED:'Libérez la table avant de l’archiver.',EMPTY_ORDER:'Ajoutez au moins un article avant de lancer le service.',VERSION_CONFLICT:'Cette commande a été modifiée sur un autre appareil. Rechargez la version du serveur avant de reprendre.',BRIDGE_AUTH_REQUIRED:'Connectez-vous avec un compte autorisé pour cette réservation.',RESERVATION_USE_BRIDGE:'Corrigez ces informations depuis la réservation liée pour synchroniser les deux applications.',ACCESS_DENIED:'Votre accès a été désactivé ou votre e-mail reste à confirmer.',ADMIN_REQUIRED:'Cette action est réservée à l’administrateur.',ORDER_LOCKED:'Cette commande est clôturée et ne peut plus être modifiée.',ORDER_HAS_PAYMENTS:'Cette commande a déjà un règlement. Ses articles sont conservés pour protéger l’historique des encaissements.',PAYMENT_EXCEEDS_BALANCE:'Ce montant dépasse le solde restant. Vérifiez les règlements récents.',PRODUCT_UNAVAILABLE:'Un produit n’est plus disponible. Actualisez la commande.',LAST_ADMIN:'Conservez au moins un administrateur actif.',IDEMPOTENCY_KEY_REUSED:'Cet identifiant a déjà été utilisé avec une autre opération.'};
 return Object.entries(errors).find(([k])=>message.includes(k))?.[1]||message;
};
