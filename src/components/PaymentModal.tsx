import {useEffect,useRef,useState} from 'react';
import {CreditCard,Banknote,Split,LockKeyhole,Check,ArrowRight,CheckCircle2,RefreshCw} from 'lucide-react';
import type {Order} from '../lib/domain';
import {euro,decimal,parseCents,orderBalance,orderTotal,orderPaid,orderLabel,readableError} from '../lib/domain';
import {useEngine,submit,notify,refresh,flush} from '../lib/engine';
import {Modal} from './Common';
import PaymentRecap,{PaymentBreakdown} from './PaymentRecap';

export default function PaymentModal({order,onClose}:{order:Order;onClose:()=>void}){
 const {data,pending,mode}=useEngine();
 const current=data.orders.find(o=>o.id===order.id)||order;
 const balance=orderBalance(data,current.id);
 const [method,setMethod]=useState<'card'|'cash'|'mixed'>('card');
 const [amount,setAmount]=useState(decimal(balance));
 const [cash,setCash]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [acceptedVersion,setAcceptedVersion]=useState(order.version);
 const [attempt,setAttempt]=useState<{ids:string[];amount:number}|null>(null);
 const guard=useRef(false);
 const balancePanel=useRef<HTMLDivElement>(null);
 const operation=pending.find(p=>p.entityId===order.id);
 const stale=current.version!==acceptedVersion;
 const closed=current.status==='paid'||current.status==='cancelled';
 const settled=current.status==='paid'&&balance===0;
 const locked=busy||!!operation||!!attempt||stale;
 const cents=parseCents(amount);
 const cashCents=method==='mixed'?parseCents(cash):0;
 const valid=Number.isSafeInteger(cents)&&cents>0&&cents<=balance&&(method!=='mixed'||(Number.isSafeInteger(cashCents)&&cashCents>0&&cashCents<cents));

 useEffect(()=>{
  if(!attempt)return;
  // An acknowledged write with a delayed snapshot must also stay locked.
  // Only confirmed payments may change the displayed balance.
  if(attempt.ids.every(id=>data.payments.some(p=>p.id===id&&p.order_id===order.id))){
   setAcceptedVersion(current.version);setAmount(decimal(Math.max(0,balance)));setCash('');setError('');
   setNotice(`${euro(attempt.amount)} ${mode==='demo'?'simulés dans la démo':'confirmés et encaissés'}.`);
   setAttempt(null);
   balancePanel.current?.closest('dialog')?.scrollTo({top:0});
  }else if(operation&&operation.status!=='queued'){
   setError(readableError(operation.error||'Ce règlement a été refusé. Vérifiez la synchronisation.'));setAttempt(null);
  }
 },[attempt,data.payments,order.id,current.version,balance,mode,operation]);

 async function pay(){
  if(guard.current||!valid||locked||closed)return;
  guard.current=true;setBusy(true);setError('');setNotice('');
  const payments=method==='mixed'?
   [{id:crypto.randomUUID(),method:'cash',amount_cents:cashCents},{id:crypto.randomUUID(),method:'card',amount_cents:cents-cashCents}]:
   [{id:crypto.randomUUID(),method,amount_cents:cents}];
  setAttempt({ids:payments.map(p=>p.id),amount:cents});
  try{
   const result=await submit('pay',current.id,current.version,{payments});
   if(result==='queued')notify('Règlement en attente · ne l’enregistrez pas une seconde fois.');
  }catch(e){setAttempt(null);setError((e as Error).message);}
  finally{guard.current=false;setBusy(false);}
 }

 return <Modal title={settled?'Récapitulatif de l’encaissement':current.status==='cancelled'?'Commande annulée':'Encaisser la commande'} subtitle={`${orderLabel(data,current)} · #${current.number}`} onClose={()=>{if(!busy)onClose();}}>
  <div ref={balancePanel} className={`payment-balance ${settled?'settled':''}`} aria-live="polite" aria-atomic="true">
   <span>{settled?'Table entièrement encaissée':'Reste à encaisser'}</span><strong>{euro(Math.max(0,balance))}</strong>
   <p>Total {euro(orderTotal(data,current.id))} <span>·</span> Déjà encaissé {euro(orderPaid(data,current.id))}</p>
   <PaymentBreakdown data={data} orderId={current.id}/>
  </div>
  {settled&&<div className="payment-complete" role="status"><CheckCircle2 size={21}/><span>Tout est réglé. Retrouvez le détail de l’addition et des encaissements ci-dessous.</span></div>}
  {!closed&&<>
   {notice&&!attempt&&<p className="payment-confirmation" role="status"><CheckCircle2 size={16}/>{notice} Vous pouvez saisir le versement suivant.</p>}
   <form onSubmit={e=>{e.preventDefault();void pay();}}>
    <fieldset className="payment-entry" disabled={busy||!!operation||!!attempt}>
     <legend className="sr-only">Nouveau versement</legend>
     <div className="payment-methods">{([{id:'card',name:'Carte bancaire',icon:CreditCard},{id:'cash',name:'Espèces',icon:Banknote},{id:'mixed',name:'Mixte',icon:Split}] as const).map(m=><button type="button" key={m.id} aria-pressed={method===m.id} className={method===m.id?'selected':''} onClick={()=>setMethod(m.id)}><m.icon size={23}/><span>{m.name}</span>{method===m.id&&<Check size={13}/>}</button>)}</div>
     <label>Montant du versement (€)<input className="amount-input" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <div className="quick-amounts"><button type="button" onClick={()=>setAmount(decimal(balance))}>Tout régler</button><button type="button" onClick={()=>setAmount(decimal(Math.round(balance/2)))}>La moitié</button><button type="button" onClick={()=>setAmount('20,00')} disabled={balance<2000}>20 €</button><button type="button" onClick={()=>setAmount('50,00')} disabled={balance<5000}>50 €</button></div>
     {method==='mixed'&&<div className="split-fields"><label>Part en espèces (€)<input inputMode="decimal" placeholder="0,00" value={cash} onChange={e=>setCash(e.target.value)}/></label><div><span>Complément CB</span><strong>{Number.isFinite(cents)&&Number.isFinite(cashCents)?euro(Math.max(0,cents-cashCents)):'—'}</strong></div></div>}
    </fieldset>
    {valid&&cents<balance&&!attempt&&!operation&&<div className="info-note">Après confirmation de ce versement, il restera {euro(balance-cents)} à encaisser.</div>}
    {(error||operation||(!attempt&&stale))&&<div className="form-error" role="alert">{error||(operation?(operation.status==='queued'?'Un versement ou une modification attend la confirmation du serveur. Le solde affiché comprend uniquement les règlements confirmés.':'Une opération a été refusée. Consultez la synchronisation pour la résoudre.'):'La commande a été modifiée sur un autre appareil. Vérifiez le nouveau solde avant de continuer.')}
     {!operation&&!attempt&&stale&&<button type="button" className="btn secondary full" onClick={()=>{setAcceptedVersion(current.version);setAmount(decimal(balance));setCash('');setError('');}}>Utiliser le solde actualisé</button>}
    </div>}
    <button type="submit" className="btn primary full" disabled={!valid||locked}>{busy?'Confirmation en cours…':attempt||operation?'Confirmation attendue…':`Encaisser ${valid?euro(cents):'le versement'}`}<ArrowRight size={17}/></button>
   </form>
   {attempt&&!busy&&<div className="payment-pending" role="status"><p>{euro(attempt.amount)} en cours de vérification. Le solde sera mis à jour à réception des règlements confirmés.</p><button type="button" className="btn secondary full" onClick={()=>void flush().then(refresh)}><RefreshCw size={15}/>Vérifier la confirmation</button></div>}
   <p className="payment-note"><LockKeyhole size={13}/> {mode==='demo'?'Simulation locale · aucun paiement réel':'Le règlement CB doit être effectué sur votre terminal bancaire.'}</p>
  </>}
  <PaymentRecap data={data} order={current} showItems={closed} showTotals={false}/>
  {closed&&<button className="btn primary full" onClick={onClose} disabled={busy}>Terminer<Check size={17}/></button>}
 </Modal>;
}
