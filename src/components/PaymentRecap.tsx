import {Banknote,CreditCard} from 'lucide-react';
import type {Order,Snapshot} from '../lib/domain';
import {dateLabel,euro,orderLines,orderPaid,orderPayments,orderTotal,time} from '../lib/domain';

export function PaymentBreakdown({data,orderId}:{data:Snapshot;orderId:string}){
 const payments=orderPayments(data,orderId);
 return <div className="payment-breakdown" aria-label="Encaissements confirmés par moyen de paiement">
  <span><CreditCard size={14}/>CB <strong>{euro(payments.filter(p=>p.method==='card').reduce((sum,p)=>sum+p.amount_cents,0))}</strong></span>
  <span><Banknote size={14}/>Espèces <strong>{euro(payments.filter(p=>p.method==='cash').reduce((sum,p)=>sum+p.amount_cents,0))}</strong></span>
 </div>;
}

export default function PaymentRecap({data,order,showItems=false,showTotals=true}:{data:Snapshot;order:Order;showItems?:boolean;showTotals?:boolean}){
 const payments=[...orderPayments(data,order.id)].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 return <div className="payment-recap">
  {showTotals&&<div className="payment-recap-totals"><h3>Récapitulatif des encaissements</h3><PaymentBreakdown data={data} orderId={order.id}/><p>Total encaissé <strong>{euro(orderPaid(data,order.id))}</strong></p></div>}
  {showItems&&<><h3>Détail de l’addition</h3><div className="receipt-detail">{orderLines(data,order.id).map(line=><div key={line.id}><span>{line.quantity} × {line.name}<small>{euro(line.unit_price_cents)} l’unité</small></span><strong>{euro(line.total_cents)}</strong></div>)}<div className="total"><span>Total TTC</span><strong>{euro(orderTotal(data,order.id))}</strong></div></div></>}
  {payments.length>0&&<section className="prior-payments" aria-label="Historique des encaissements"><h3>Historique des encaissements</h3>{payments.map(payment=><div key={payment.id}><span>{payment.method==='card'?<CreditCard size={15}/>:<Banknote size={15}/>}<span>{payment.method==='card'?'Carte bancaire':'Espèces'}<small>{dateLabel(payment.created_at)} · {time(payment.created_at)}</small></span></span><strong>{euro(payment.amount_cents)}</strong></div>)}</section>}
 </div>;
}
