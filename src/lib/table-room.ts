import type {Snapshot,Table,Order} from './domain';
import {orderBalance,orderTotal} from './domain';
export const independentTable=(t:Table)=>!t.external_table_id?.startsWith('dipsy-tables:');
export function tableState(data:Snapshot,tableId:string){
 const session=(data.table_sessions||[]).find(s=>s.table_id===tableId&&!s.released_at);
 const order=session?data.orders.find(o=>o.id===session.order_id):undefined;
 const paid=!!order&&order.status==='paid'&&orderTotal(data,order.id)>0&&orderBalance(data,order.id)===0;
 const state=paid?'settled':session?.launched_at?'serving':'free';
 return {session,order,state:state as 'free'|'serving'|'settled',label:paid?'Payée · à libérer':state==='serving'?'Service lancé':order?'En préparation':'Libre'};
}
export const currentSession=(data:Snapshot,o:Order)=>(data.table_sessions||[]).find(s=>s.order_id===o.id&&!s.released_at);
