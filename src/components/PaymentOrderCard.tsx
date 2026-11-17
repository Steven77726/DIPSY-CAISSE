import {ArrowUpRight} from 'lucide-react';
import type {Order,Snapshot} from '../lib/domain';
import {euro,orderBalance,orderLabel,orderPaid,orderTotal,time} from '../lib/domain';
import {Badge} from './Common';

export default function PaymentOrderCard({data,order,pending,onOpen}:{data:Snapshot;order:Order;pending:boolean;onOpen:()=>void}){
 const closed=order.status==='paid'||order.status==='cancelled';
 const label=orderLabel(data,order);
 const client=data.clients.find(c=>c.id===order.client_id);
 return <article className="payment-order-card" aria-label={`${label} · commande ${order.number}`}>
  <header><div><h3>{label}</h3><p>#{order.number} · {time(order.created_at)}{client&&<> · {client.name}</>}</p></div><Badge status={order.status}/></header>
  <dl><div><dt>Total</dt><dd>{euro(orderTotal(data,order.id))}</dd></div><div><dt>Déjà encaissé</dt><dd>{euro(orderPaid(data,order.id))}</dd></div><div className="remaining"><dt>Restant</dt><dd>{order.status==='cancelled'?'—':euro(orderBalance(data,order.id))}</dd></div></dl>
  {pending&&<p className="pending-text" role="status">Confirmation en attente</p>}
  <button className={`btn ${closed?'secondary':'primary'} full`} disabled={pending} aria-label={`${closed?'Détail de':'Encaisser'} ${label}`} onClick={onOpen}>{closed?'Voir le détail':'Encaisser'}<ArrowUpRight size={18}/></button>
 </article>;
}
