import {useState} from 'react';
import {RefreshCw} from 'lucide-react';
import type {Operation} from '../lib/domain';
import {readableError} from '../lib/domain';
import {flush,refresh,dismissOperation} from '../lib/engine';

export default function OperationNotice({operation,resumeLabel='Reprendre après vérification',detail,onResolved}:{operation:Operation;resumeLabel?:string;detail?:string;onResolved?:()=>void}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const queued=operation.status==='queued';
 async function recover(){if(busy)return;setBusy(true);setError('');try{
  if(queued){await flush();await refresh();}
  else{await refresh();await dismissOperation(operation.id,onResolved);}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={queued?'info-note operation-notice':'form-error operation-notice'} role={queued?'status':'alert'}>
  <strong>{queued?'Vérification en cours':'Cette opération n’a pas été enregistrée'}</strong>
  <p>{queued?'Votre ticket est conservé sur cet appareil. La connexion doit confirmer l’enregistrement avant de continuer.':detail||readableError(operation.error||'Le serveur a refusé cette modification.')}</p>
  {!queued&&<p>La tentative refusée sera conservée dans les archives locales. Le ticket serveur et les encaissements restent conservés.</p>}
  <button type="button" className="btn secondary full" disabled={busy} onClick={()=>void recover()}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'Vérification…':queued?'Vérifier maintenant':resumeLabel}</button>
  {error&&<p role="alert">{error}</p>}
 </div>;
}
