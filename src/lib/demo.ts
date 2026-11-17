import type {Snapshot,Product,Line,Operation,Order} from './domain';
import {categories,emptySnapshot,netCents,orderTotal,orderPaid} from './domain';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const demoActor=uid(9999);
export function demoSnapshot():Snapshot{
 const s=emptySnapshot();const now=new Date();const ago=(minutes:number)=>new Date(now.getTime()-minutes*60000).toISOString();
 const catalog:[string,Product['category'],number,number,Product['accounting_group']][]=[
 ['Burrata crémeuse','entrees',1600,1000,'food'],['Tartare de saumon','entrees',1800,1000,'food'],['Houmous maison','entrees',1200,1000,'food'],['Croustillants de gambas','entrees',1700,1000,'food'],
 ['Rigatoni à la truffe','plats',2800,1000,'food'],['Filet de bar','plats',3200,1000,'food'],['Suprême de volaille','plats',2600,1000,'food'],['Entrecôte & frites','plats',3600,1000,'food'],
 ['Tiramisu maison','desserts',1100,1000,'food'],['Fondant chocolat','desserts',1200,1000,'food'],['Pavlova fruits rouges','desserts',1300,1000,'food'],
 ['Eau minérale 75 cl','boissons',700,1000,'non_alcohol'],['Eau à emporter · fermée','boissons',400,550,'non_alcohol'],['Citronnade maison','boissons',800,1000,'non_alcohol'],['Espresso','boissons',350,1000,'non_alcohol'],
 ['Spritz signature','cocktails',1500,2000,'alcohol'],['Margarita','cocktails',1600,2000,'alcohol'],['Verre de rosé','vins',900,2000,'alcohol'],['Champagne · bouteille','vins',9500,2000,'alcohol'],['Bière pression','alcool',800,2000,'alcohol']];
 s.products=catalog.map(([name,category,price_cents,vat_bps,accounting_group],i)=>({id:uid(i+1),name,category,price_cents,vat_bps,accounting_group,active:true,version:1}));
 s.product_order=categories.filter(c=>c.id!=='all').map((c,i)=>({id:uid(7000+i),category:c.id as Product['category'],product_ids:[],version:0}));
 s.tables=Array.from({length:16},(_,i)=>({id:uid(100+i),label:`Table ${String(i+1).padStart(2,'0')}`,seats:i%3===0?6:4,active:true,version:1}));
 s.clients=[{id:uid(200),name:'Camille Martin',phone:'06 12 34 56 78',version:1,created_at:ago(60)},{id:uid(201),name:'Alexandre Laurent',phone:'06 98 76 54 32',version:1,created_at:ago(120)},{id:uid(202),name:'Léa Dubois',phone:'07 11 22 33 44',version:1,created_at:ago(90)}];
 const order=(n:number,table:number,status:Order['status'],minutes:number,items:[number,number][],client:number|null=null)=>{
 const id=uid(300+n);const o:Order={id,number:1040+n,table_id:table<0?null:uid(100+table),client_id:client===null?null:uid(200+client),label:table<0?'Au comptoir':'',status,version:1,created_by:demoActor,created_at:ago(minutes),updated_at:ago(Math.max(0,minutes-15))};s.orders.push(o);
 items.forEach(([index,quantity],i)=>{const p=s.products[index];const total=p.price_cents*quantity;s.lines.push({id:uid(1000+n*10+i),order_id:id,product_id:p.id,name:p.name,quantity,unit_price_cents:p.price_cents,vat_bps:p.vat_bps,accounting_group:p.accounting_group,total_cents:total,net_cents:netCents(total,p.vat_bps)});});return o;
 };
 order(1,5,'open',12,[[0,2],[4,2],[15,2]],0);order(2,1,'due',39,[[1,2],[5,2],[17,3]],1);order(3,7,'open',8,[[2,1],[7,2],[19,2]]);order(4,11,'due',52,[[4,3],[8,3],[18,1]],2);order(5,-1,'open',4,[[15,2],[13,1]]);
 for(let i=6;i<22;i++){const o=order(i,(i*3)%16,'paid',70+i*9,[[i%8,1+i%3],[15+i%5,1+i%2]],i%3);const total=orderTotal(s,o.id);const mixed=i%4===0;s.payments.push({id:uid(2000+i),order_id:o.id,operation_id:uid(3000+i),method:mixed?'cash':'card',amount_cents:mixed?2000:total,created_at:o.updated_at,created_by:demoActor});if(mixed)s.payments.push({id:uid(4000+i),order_id:o.id,operation_id:uid(3000+i),method:'card',amount_cents:total-2000,created_at:o.updated_at,created_by:demoActor});}
 order(22,3,'cancelled',100,[[0,1]]);
 const partial=s.orders.find(o=>o.number===1042)!;s.payments.push({id:uid(5000),order_id:partial.id,operation_id:uid(5001),method:'cash',amount_cents:2000,created_at:ago(20),created_by:demoActor});
 s.table_sessions=[];for(const t of s.tables){const o=s.orders.filter(o=>o.table_id===t.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];if(o&&o.status!=='cancelled')s.table_sessions.push({id:crypto.randomUUID(),table_id:t.id,order_id:o.id,launched_at:o.created_at,released_at:null,version:1,created_by:demoActor,created_at:o.created_at,updated_at:o.created_at});}
 s.access=[{email:'demo@dipsy.fr',name:'Steven',role:'admin',active:true,version:1}];
 s.events=s.orders.map(o=>({id:crypto.randomUUID(),operation_id:crypto.randomUUID(),order_id:o.id,kind:'save_order',created_at:o.created_at,before_state:null,after_state:{order:o}}));
 return s;
}
export function applyDemo(s:Snapshot,op:Operation):Snapshot{
 const next=structuredClone(s);const p=op.payload as any;const existing=next.orders.find(o=>o.id===op.entityId);
 if(op.kind==='reorder_products'){
  const order=next.product_order?.find(o=>o.id===op.entityId);if(!order||order.version!==op.baseVersion)throw Error('VERSION_CONFLICT');
  order.product_ids=[...p.product_ids];order.version++;
 }else if(op.kind==='save_order'){
  if(existing&&existing.version!==op.baseVersion)throw new Error('VERSION_CONFLICT');
  if(existing&&(existing.status==='paid'||existing.status==='cancelled'))throw new Error('ORDER_LOCKED');
  if(existing&&orderPaid(next,existing.id)>0)throw new Error('ORDER_HAS_PAYMENTS');
  const now=new Date().toISOString();const o:Order=existing?{...existing,table_id:p.table_id||null,client_id:p.client_id||null,label:p.label||'',status:p.status,version:existing.version+1,updated_at:now}:{id:op.entityId,number:Math.max(1040,...next.orders.map(o=>o.number))+1,table_id:p.table_id||null,client_id:p.client_id||null,label:p.label||'',status:p.status,version:1,created_at:now,updated_at:now,created_by:demoActor};
  const old=next.lines.filter(l=>l.order_id===o.id);next.lines=next.lines.filter(l=>l.order_id!==o.id);
  p.lines.forEach((l:any)=>{const prev=old.find(x=>x.id===l.id);const prod=next.products.find(x=>x.id===l.product_id)!;const unit=prev?.unit_price_cents??prod.price_cents;const vat=prev?.vat_bps??prod.vat_bps;const total=unit*l.quantity;next.lines.push({...l,order_id:o.id,name:prev?.name??prod.name,reference:prev?.reference??prod.reference??'',unit_price_cents:unit,vat_bps:vat,accounting_group:prev?.accounting_group??prod.accounting_group,total_cents:total,net_cents:netCents(total,vat)});});
  next.orders=[o,...next.orders.filter(x=>x.id!==o.id)];
  if(o.table_id){const sessions=next.table_sessions ||= [];const current=sessions.find(s=>s.table_id===o.table_id&&!s.released_at);if(current&&current.order_id!==o.id)throw Error('TABLE_BUSY');if(!current)sessions.push({id:crypto.randomUUID(),table_id:o.table_id,order_id:o.id,launched_at:p.status==='due'?now:null,released_at:null,version:1,created_by:demoActor,created_at:now,updated_at:now});}
 }else if(op.kind==='launch_service'){
  if(!existing||existing.version!==op.baseVersion)throw Error('VERSION_CONFLICT');const session=next.table_sessions?.find(s=>s.order_id===existing.id&&!s.released_at);if(!session)throw Error('TABLE_SESSION_NOT_FOUND');if(!next.lines.some(l=>l.order_id===existing.id))throw Error('EMPTY_ORDER');if(['paid','cancelled'].includes(existing.status))throw Error('ORDER_LOCKED');session.launched_at=new Date().toISOString();session.version++;existing.status='due';existing.version++;
 }else if(op.kind==='archive_table'){
  const t=next.tables.find(t=>t.id===op.entityId);if(!t||t.version!==op.baseVersion)throw Error('VERSION_CONFLICT');if(p.confirmation!=='supprimer')throw Error('TABLE_CONFIRMATION_REQUIRED');
  t.active=false;t.version++;const s=next.table_sessions?.find(s=>s.table_id===t.id&&!s.released_at);if(s){s.released_at=new Date().toISOString();s.version++;}
 }else if(op.kind==='release_table'){
  const session=next.table_sessions?.find(s=>s.id===op.entityId),o=next.orders.find(o=>o.id===session?.order_id);if(!session||!o||session.version!==op.baseVersion||p.order_version!==o.version)throw Error('VERSION_CONFLICT');if(o.status!=='paid'||orderPaid(next,o.id)!==orderTotal(next,o.id))throw Error('TABLE_NOT_SETTLED');session.released_at=new Date().toISOString();session.version++;const t=next.tables.find(t=>t.id===session.table_id);if(t){t.active=false;t.version++;}
 }else if(op.kind==='correct_line'){
  if(!existing||existing.version!==op.baseVersion)throw new Error('VERSION_CONFLICT');
  if(['paid','cancelled'].includes(existing.status))throw new Error('ORDER_LOCKED');
  if(orderPaid(next,existing.id)>0)throw new Error('ORDER_HAS_PAYMENTS');
  const l=next.lines.find(l=>l.id===p.line_id&&l.order_id===existing.id),prod=next.products.find(x=>x.id===p.product_id);
  if(!l||!prod)throw new Error('LINE_NOT_FOUND');
  if(!p.name.trim()||!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>999||!Number.isInteger(p.unit_price_cents)||p.unit_price_cents<1||p.unit_price_cents>1000000)throw new Error('INVALID_LINE');
  if(l.product_id!==prod.id){l.vat_bps=prod.vat_bps;l.accounting_group=prod.accounting_group;}
  l.vat_bps=p.vat_bps??l.vat_bps;l.accounting_group=p.accounting_group??l.accounting_group;
  Object.assign(l,{reference:p.reference??l.reference??'',product_id:prod.id,name:p.name.trim(),quantity:p.quantity,unit_price_cents:p.unit_price_cents,total_cents:p.quantity*p.unit_price_cents,net_cents:netCents(p.quantity*p.unit_price_cents,l.vat_bps)});existing.version++;existing.updated_at=new Date().toISOString();
 }else if(op.kind==='pay'||op.kind==='cancel_order'){
  if(!existing||existing.version!==op.baseVersion)throw new Error('VERSION_CONFLICT');
  if(['paid','cancelled'].includes(existing.status))throw new Error('ORDER_LOCKED');
  if(op.kind==='pay'){
   const amount=p.payments.reduce((n:number,x:any)=>n+x.amount_cents,0);const balance=orderTotal(next,existing.id)-orderPaid(next,existing.id);
   if(amount<=0||amount>balance)throw new Error('PAYMENT_EXCEEDS_BALANCE');
   p.payments.forEach((x:any)=>{next.payments.push({...x,operation_id:op.id,order_id:existing.id,created_at:new Date().toISOString(),created_by:demoActor});});existing.status=amount===balance?'paid':'due';
  }else {if(orderPaid(next,existing.id)>0)throw new Error('ORDER_HAS_PAYMENTS');existing.status='cancelled';const session=next.table_sessions?.find(s=>s.order_id===existing.id&&!s.released_at);if(session){session.released_at=new Date().toISOString();session.version++;}}
  existing.version++;existing.updated_at=new Date().toISOString();
 }else{
  const key=({save_client:'clients',save_product:'products',save_table:'tables',save_access:'access'} as Record<string,'clients'|'products'|'tables'|'access'>)[op.kind];
  if(!key)throw new Error('UNKNOWN_OPERATION');const list=next[key] as any[];const old=list.find(x=>key==='access'?x.email===p.email:x.id===op.entityId);if((old?.version??0)!==op.baseVersion)throw new Error('VERSION_CONFLICT');
  const value={...old,...p,id:op.entityId,version:(old?.version??0)+1,created_at:old?.created_at||new Date().toISOString()};(next as any)[key]=[value,...list.filter(x=>x!==old)];
 }
 next.events.unshift({id:crypto.randomUUID(),operation_id:op.id,order_id:existing?.id||(op.kind==='save_order'?op.entityId:null),kind:op.kind,created_at:new Date().toISOString(),before_state:existing?{order:s.orders.find(o=>o.id===existing.id)}:null,after_state:op.payload});return next;
}
