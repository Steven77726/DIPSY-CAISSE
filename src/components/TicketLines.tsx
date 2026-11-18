import {Minus,Plus,Pencil} from 'lucide-react';
import type {Line} from '../lib/domain';
import {euro} from '../lib/domain';
import {Empty} from './Common';

export default function TicketLines({lines,canCorrect,quantityDisabled,correctionDisabled,onQuantity,onCorrect}:{
 lines:Line[];canCorrect:boolean;quantityDisabled:boolean;correctionDisabled:boolean;
 onQuantity:(id:string,delta:number)=>void;onCorrect:(line:Line)=>void;
}){
 if(!lines.length)return <Empty title="À vous de jouer">Touchez un produit pour l’ajouter à la commande.</Empty>;
 return <div role="list" aria-label="Articles de l’addition">{lines.map(line=><div className="ticket-line" role="listitem" key={line.id}>
  <div className="line-description"><strong>{line.name}</strong>
   {line.reference&&<small>Réf. {line.reference}</small>}
   <span>{line.quantity} × {euro(line.unit_price_cents)} · TVA {line.vat_bps/100} %</span>
   <div className="ticket-line-actions"><div className="quantity-control">
    <button aria-label={`Retirer un ${line.name}`} disabled={quantityDisabled} onClick={()=>onQuantity(line.id,-1)}><Minus size={16}/></button>
    <b>{line.quantity}</b>
    <button aria-label={`Ajouter un ${line.name}`} disabled={quantityDisabled||line.quantity>=999} onClick={()=>onQuantity(line.id,1)}><Plus size={16}/></button>
   </div>{canCorrect&&<button className="text-button line-correction" aria-label={`Corriger ${line.name}`} title="Corriger l’article" disabled={correctionDisabled} onClick={()=>onCorrect(line)}><Pencil size={16}/>Corriger</button>}</div>
  </div><strong>{euro(line.unit_price_cents*line.quantity)}</strong>
 </div>)}</div>;
}
