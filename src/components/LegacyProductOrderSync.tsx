import {useEffect,useRef} from 'react';
import {useEngine,submit,notify} from '../lib/engine';
import {readLegacyProductOrder,legacyOrderCandidate} from '../lib/product-order';

// The previous release stored a single order on the device. Import it once with
// a version-zero compare-and-swap; a server order always wins over a stale device.
export default function LegacyProductOrderSync(){
 const {mode,role,data,pending,connection,session}=useEngine();const attempted=useRef(new Set<string>());
 useEffect(()=>{
  if(mode!=='live'||role!=='admin'||connection!=='connected'||pending.some(p=>p.kind==='reorder_products'))return;
  const legacy=readLegacyProductOrder();if(!legacy.length)return;
  for(const order of data.product_order||[]){
   const key=`${session?.user.id}:${order.id}`;if(attempted.current.has(key))continue;
   const ids=legacyOrderCandidate(data.products,order,legacy);if(!ids)continue;
   attempted.current.add(key);
   void submit('reorder_products',order.id,order.version,{product_ids:ids}).then(result=>{if(result==='confirmed')notify('Votre ancien classement est maintenant partagé entre vos appareils.');}).catch(()=>notify('Le classement a changé sur un autre appareil. Vérifiez-le dans Carte & TVA.'));
   break;
  }
 },[mode,role,data.product_order,data.products,pending,connection,session]);
 return null;
}
