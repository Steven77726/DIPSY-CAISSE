import {useState} from 'react';
import type {Table} from '../lib/domain';
import {euro,orderBalance} from '../lib/domain';
import {getEngine,useEngine,submit,notify} from '../lib/engine';
import {tableState} from '../lib/table-room';
import {Modal} from './Common';
import OperationNotice from './OperationNotice';

export default function TableRemoval({table,onClose}:{table:Table;onClose:()=>void}){
 const {data,pending}=useEngine();
 function capture(){const state=getEngine();const t=state.data.tables.find(t=>t.id===table.id)||table;const s=tableState(state.data,t.id);return {table_version:t.version,session_id:s.session?.id||null,session_version:s.session?.version??null,order_id:s.order?.id||null,order_version:s.order?.version??null};}
 const [expected,setExpected]=useState(capture);const [confirmation,setConfirmation]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const current=data.tables.find(t=>t.id===table.id)||table;const state=tableState(data,table.id);
 const changed=JSON.stringify(capture())!==JSON.stringify(expected);
 const operation=pending.find(p=>p.entityId===table.id||p.entityId===state.order?.id||p.entityId===state.session?.id||p.kind==='save_order'&&p.payload.table_id===table.id);
 async function remove(){if(busy||operation||changed||confirmation.trim().toLowerCase()!=='supprimer')return;setBusy(true);setError('');try{
  const result=await submit('archive_table',table.id,expected.table_version,{...expected,confirmation:'supprimer'});
  notify(result==='queued'?'Retrait conservé sur cet appareil · confirmation en attente':'Table retirée de la salle · tickets et règlements conservés');onClose();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Modal title="Supprimer cette table de la salle ?" subtitle={current.label} onClose={()=>{if(!busy)onClose();}}><form onSubmit={e=>{e.preventDefault();void remove();}}>
  <p>Le carré disparaîtra de « Vos tables ». Les commandes, les articles et les règlements resteront dans l’historique.</p>
  {state.order&&orderBalance(data,state.order.id)>0&&<div className="info-note">Il reste {euro(orderBalance(data,state.order.id))} à encaisser. Cette somme restera accessible dans l’onglet Encaissement.</div>}
  {operation&&<OperationNotice operation={operation} onResolved={()=>setError('')}/>}
  {changed&&<div className="info-note">La table ou son ticket a changé. Vérifiez les montants avant de confirmer.<button type="button" className="btn secondary full" onClick={()=>{setExpected(capture());setConfirmation('');setError('');}}>Utiliser la version actualisée</button></div>}
  {error&&<div className="form-error" role="alert">{error}</div>}
  <label>Pour confirmer, écrivez « supprimer »<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy||!!operation} /></label>
  <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Conserver la table</button><button className="btn danger" type="submit" disabled={busy||!!operation||changed||confirmation.trim().toLowerCase()!=='supprimer'}>{busy?'Confirmation…':'Supprimer de la salle'}</button></div>
 </form></Modal>;
}
