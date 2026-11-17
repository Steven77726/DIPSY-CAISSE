import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {demoSnapshot,applyDemo,demoActor} from '../src/lib/demo';
import {orderBalance,orderPaid,orderTotal} from '../src/lib/domain';
import type {Operation,Snapshot} from '../src/lib/domain';
import PaymentRecap from '../src/components/PaymentRecap';

function addition(){
 const data=demoSnapshot();const order=data.orders[0];const line=data.lines.find(l=>l.order_id===order.id)!;
 data.orders=[order];data.lines=[{...line,name:'Addition de la table',quantity:1,unit_price_cents:34900,total_cents:34900,net_cents:31727}];data.payments=[];
 return data;
}
function pay(data:Snapshot,method:'card'|'cash',amount:number){
 const order=data.orders[0];
 const op:Operation={id:crypto.randomUUID(),actor:demoActor,kind:'pay',entityId:order.id,baseVersion:order.version,payload:{payments:[{id:crypto.randomUUID(),method,amount_cents:amount}]},status:'queued',createdAt:new Date().toISOString()};
 return applyDemo(data,op);
}
const text=(html:string)=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');

describe('encaissement successif dans la même addition',()=>{
 it('déduit 49 € sur 349 €, puis solde la même commande en plusieurs versements',()=>{
  let data=addition();const id=data.orders[0].id;
  data=pay(data,'card',4900);expect(orderBalance(data,id)).toBe(30000);expect(orderPaid(data,id)).toBe(4900);expect(data.orders[0].status).toBe('due');
  data=pay(data,'cash',10000);expect(orderBalance(data,id)).toBe(20000);
  data=pay(data,'card',20000);expect(data.orders[0].id).toBe(id);expect(data.orders[0].version).toBe(4);expect(data.orders[0].status).toBe('paid');expect(orderBalance(data,id)).toBe(0);expect(orderPaid(data,id)).toBe(orderTotal(data,id));expect(data.payments).toHaveLength(3);
  const recap=text(renderToStaticMarkup(createElement(PaymentRecap,{data,order:data.orders[0],showItems:true})));
  expect(recap).toContain('CB 249,00 €');expect(recap).toContain('Espèces 100,00 €');expect(recap).toContain('Total encaissé 349,00 €');expect(recap).toContain('Détail de l’addition');expect(recap).toContain('1 × Addition de la table');expect(recap).toContain('49,00 €');expect(recap).toContain('200,00 €');
 });
 it('affiche uniquement les encaissements de la commande sélectionnée',()=>{
  const data=pay(addition(),'card',4900);data.payments.push({...data.payments[0],id:crypto.randomUUID(),order_id:'another-order',method:'cash',amount_cents:9900});
  const recap=text(renderToStaticMarkup(createElement(PaymentRecap,{data,order:data.orders[0]})));
  expect(recap).toContain('CB 49,00 €');expect(recap).toContain('Espèces 0,00 €');expect(recap).toContain('Total encaissé 49,00 €');expect(recap).not.toContain('99,00 €');
 });
});
