import {useSyncExternalStore} from 'react';
import type {Session,RealtimeChannel} from '@supabase/supabase-js';
import type {Snapshot,Operation,Role} from './domain';
import {emptySnapshot,readableError} from './domain';
import {supabase,publicSupabase} from './supabase';
import {readCache,saveCache,readOperations,saveOperation,deleteOperation,clearCache} from './storage';
import {demoSnapshot,applyDemo,demoActor} from './demo';
import {reservationLink,startReservationHandoff,restoreAuthReservation} from './reservation-link';
type Connection='connecting'|'connected'|'syncing'|'offline'|'error';
interface State {mode:'loading'|'login'|'live'|'demo';session:{user:{id:string;email?:string}}|null;publicAccess:boolean;role:Role|null;data:Snapshot;pending:Operation[];connection:Connection;error:string;lastSync:string|null;toast:string}
let state:State={mode:'loading',session:null,publicAccess:false,role:null,data:emptySnapshot(),pending:[],connection:navigator.onLine?'connecting':'offline',error:'',lastSync:null,toast:''};
const listeners=new Set<()=>void>();let channel:RealtimeChannel|null=null;let refreshTimer:ReturnType<typeof setTimeout>;let toastTimer:ReturnType<typeof setTimeout>;let generation=0;let refreshWaiters:(()=>void)[]=[];let refreshing=false;let refreshAgain=false;let realtimeReady=false;let flushing=false;let started=false;let checkingPublic=false;let bootSession:Session|null|undefined;let publicAvailable=false;
function emit(p:Partial<State>){state={...state,...p};listeners.forEach(l=>l());}
export function notify(toast:string){clearTimeout(toastTimer);emit({toast});toastTimer=setTimeout(()=>emit({toast:''}),5500);}
export const getEngine=()=>state;
export const useEngine=()=>useSyncExternalStore(cb=>{listeners.add(cb);return()=>{listeners.delete(cb);};},()=>state);
const wireOperation=(op:Operation)=>({id:op.id,kind:op.kind,entityId:op.entityId,baseVersion:op.baseVersion,payload:op.payload,...(op.deviceId?{deviceId:op.deviceId}:{})});
const transport=()=>state.publicAccess?publicSupabase:supabase;
function deviceId(){let id=localStorage.getItem('dipsy-caisse-device');if(!id){id=crypto.randomUUID();localStorage.setItem('dipsy-caisse-device',id);}return id;}
async function connectPublic(){
 const gen=++generation;channel?.unsubscribe();channel=null;realtimeReady=false;
 const user=`public-${deviceId()}`;
 emit({mode:'loading',session:{user:{id:user}},publicAccess:true,role:'admin',data:emptySnapshot(),pending:[],error:'',connection:navigator.onLine?'connecting':'offline'});
 try{
  const [cache,pending]=await Promise.all([readCache(user),readOperations(user)]);
  if(gen!==generation)return;
  emit({mode:'live',data:cache||emptySnapshot(),pending:pending.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),lastSync:cache?.server_time||null});
  if(navigator.onLine){subscribe();await refresh();await flush();}
 }catch(e){if(gen===generation)emit({mode:'live',connection:'error',error:`Stockage local indisponible : ${(e as Error).message}`});}
}
async function bootstrap(){
 checkingPublic=true;
 if(reservationLink().requested){
  const free=navigator.onLine?await publicSupabase.rpc('dipsy_bridge_public_access').abortSignal(AbortSignal.timeout(10000)):{data:null,error:true};
  if(!free.error)localStorage.setItem('dipsy-bridge-free-enabled',String(free.data===true));
  if(free.error?localStorage.getItem('dipsy-bridge-free-enabled')==='true':free.data===true){checkingPublic=false;publicAvailable=true;await connectPublic();return;}
  const response=await supabase.auth.getSession();const session=bootSession||response.data.session;checkingPublic=false;
  if(session)await connect(session);else emit({mode:'login',session:null,publicAccess:false,role:null,error:reservationLink().id?'Connectez-vous pour ouvrir cette réservation sécurisée.':'Identifiant de réservation invalide.'});
  return;
 }
 try{
  let enabled=false;
  if(navigator.onLine){const {data,error}=await publicSupabase.rpc('caisse_public_access').abortSignal(AbortSignal.timeout(10000));if(error)throw error;enabled=data===true;localStorage.setItem('dipsy-caisse-public-enabled',String(enabled));}
  else enabled=localStorage.getItem('dipsy-caisse-public-enabled')==='true';
  publicAvailable=enabled;checkingPublic=false;
  if(enabled){await connectPublic();return;}
 }catch(e){
  checkingPublic=false;
  if(localStorage.getItem('dipsy-caisse-public-enabled')==='true'){publicAvailable=true;await connectPublic();return;}
  emit({mode:'login',error:navigator.onLine?'Impossible de vérifier la connexion à la caisse. Réessayez dans un instant.':'Une première ouverture avec Internet est nécessaire.',connection:navigator.onLine?'error':'offline'});return;
 }
 const session=bootSession!==undefined?bootSession:(await supabase.auth.getSession()).data.session;
 if(session)await connect(session);else emit({mode:'login',session:null,publicAccess:false,role:null});
}

async function connect(session:Session){
 const gen=++generation;channel?.unsubscribe();channel=null;realtimeReady=false;emit({mode:'loading',session,publicAccess:false,role:null,data:emptySnapshot(),pending:[],error:'',connection:navigator.onLine?'connecting':'offline'});
 try{
  const [cache,pending]=await Promise.all([readCache(session.user.id),readOperations(session.user.id)]);
  if(gen!==generation)return;
  if(cache)emit({data:cache,lastSync:cache.server_time||null});emit({pending:pending.sort((a,b)=>a.createdAt.localeCompare(b.createdAt))});
  if(!navigator.onLine){const role=localStorage.getItem(`dipsy-role-${session.user.id}`) as Role|null;if(!role)throw new Error('Connectez-vous une première fois avec Internet.');emit({mode:'live',role,connection:'offline'});return;}
  const {data:role,error}=await supabase.rpc('caisse_my_role');if(error)throw error;if(!role)throw new Error('Accès non autorisé. Votre adresse doit être confirmée et autorisée par l’administrateur.');
  if(gen!==generation)return;localStorage.setItem(`dipsy-role-${session.user.id}`,role);emit({mode:'live',role});
  subscribe();await refresh();await flush();
 }catch(e){if(gen!==generation)return;emit({mode:'login',role:null,error:(e as Error).message,connection:'error'});}
}
function subscribe(){if(channel||!state.session)return;channel=transport().channel(`caisse-${state.session.user.id}`);for(const table of ['caisse_access','caisse_products','caisse_tables','caisse_clients','caisse_orders','caisse_order_lines','caisse_payments','caisse_events','dipsy_reservations'])channel.on('postgres_changes',{event:'*',schema:'public',table},()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),200);});channel.subscribe(status=>{realtimeReady=status==='SUBSCRIBED';if(realtimeReady){void refresh();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&state.mode==='live'){emit({connection:navigator.onLine?'error':'offline',error:'La liaison temps réel est interrompue. Reconnexion automatique…'});}});}
export async function refresh(){
 if(state.mode!=='live'||!state.session)return;
 if(!navigator.onLine){emit({connection:'offline'});return;}
 if(refreshing){refreshAgain=true;return new Promise<void>(resolve=>refreshWaiters.push(resolve));}
 refreshing=true;const gen=generation;const user=state.session.user.id;
 try{
  const {data,error}=await transport().rpc('caisse_snapshot').abortSignal(AbortSignal.timeout(15000));if(error)throw error;if(!data)throw new Error('ACCESS_DENIED');if(gen!==generation)return;
  await saveCache(user,data as Snapshot);if(gen!==generation)return;
  emit({data:data as Snapshot,lastSync:(data as Snapshot).server_time||new Date().toISOString(),connection:state.pending.some(p=>p.status==='queued')?'syncing':realtimeReady?'connected':'connecting',error:''});
 }catch(e){if(gen===generation)emit({connection:navigator.onLine?'error':'offline',error:readableError((e as Error).message)});}
 finally{refreshing=false;if(refreshAgain){refreshAgain=false;await refresh();}for(const done of refreshWaiters.splice(0))done();}
}
export async function submit(kind:string,entityId:string,baseVersion:number,payload:Record<string,unknown>):Promise<'confirmed'|'queued'>{
 if(state.pending.some(p=>p.entityId===entityId))throw new Error('Une opération est déjà en attente pour cet élément. Vérifiez la synchronisation.');
 const actor=state.mode==='demo'?demoActor:state.session?.user.id;if(!actor)throw new Error('Connectez-vous avant de continuer.');
 const op:Operation={id:crypto.randomUUID(),actor,kind,entityId,baseVersion,payload,deviceId:deviceId(),status:'queued',createdAt:new Date().toISOString()};
 if(state.mode==='demo'){emit({data:applyDemo(state.data,op)});notify('Démo · modification enregistrée localement');return 'confirmed';}
 // Await the durable IndexedDB transaction before any HTTP request.
 await saveOperation(actor,op);emit({pending:[...state.pending,op],connection:navigator.onLine?'syncing':'offline'});
 await flush();const remaining=state.pending.find(p=>p.id===op.id);if(remaining&&remaining.status!=='queued')throw new Error(readableError(remaining.error||'Échec de l’opération'));
 return remaining?'queued':'confirmed';
}
export async function flush(){
 if(flushing||state.mode!=='live'||!state.session||!navigator.onLine)return;flushing=true;const user=state.session.user.id;const gen=generation;
 const execute=async()=>{
  for(const op of [...state.pending].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
   if(op.status!=='queued'||op.actor!==user)continue;
   try{
    emit({connection:'syncing'});const {error}=await transport().rpc('caisse_apply_operation',{op:wireOperation(op)}).abortSignal(AbortSignal.timeout(12000));if(error)throw error;
    // Confirmation precedes removing the outbox entry. A crash before deletion replays the same key.
    await deleteOperation(user,op.id);if(gen!==generation)return;emit({pending:state.pending.filter(p=>p.id!==op.id)});
   }catch(e){
    if(gen!==generation)return;const err=e as {code?:string;message:string};
    const network=!err.code||err.code.startsWith('08')||['57014','53300','57P01','PGRST000','PGRST001','PGRST002','PGRST003'].includes(err.code);
    if(network){emit({connection:navigator.onLine?'error':'offline',error:'Confirmation serveur en attente. L’opération sera renvoyée avec le même identifiant.'});break;}
    const failed:Operation={...op,status:err.message.includes('VERSION_CONFLICT')?'conflict':'failed',error:err.message};await saveOperation(user,failed);emit({pending:state.pending.map(p=>p.id===op.id?failed:p),connection:'error',error:readableError(err.message)});
   }
  }
 };
 try{if(navigator.locks)await navigator.locks.request(`dipsy-flush-${user}`,execute);else await execute();}
 finally{flushing=false;await refresh();}
}
export async function dismissOperation(id:string){if(!state.session)return;const op=state.pending.find(p=>p.id===id);if(!op||op.status==='queued')throw new Error('Une opération sans confirmation ne peut pas être supprimée. Reconnectez-vous pour vérifier son état.');await deleteOperation(state.session.user.id,id);emit({pending:state.pending.filter(p=>p.id!==id)});await refresh();}
export function enterDemo(){if(state.pending.some(p=>p.status==='queued')){notify('Synchronisez les opérations en attente avant de changer de mode.');return;}++generation;channel?.unsubscribe();channel=null;emit({mode:'demo',session:null,publicAccess:false,role:'admin',data:demoSnapshot(),pending:[],connection:'connected',error:'',lastSync:null});}
export async function logout(){if(state.pending.some(p=>p.status==='queued'))throw new Error('Des opérations attendent encore la confirmation du serveur. Synchronisez avant de vous déconnecter.');const user=state.session?.user.id;if(user){await clearCache(user);localStorage.removeItem(`dipsy-role-${user}`);}++generation;channel?.unsubscribe();channel=null;await supabase.auth.signOut();emit({mode:'login',session:null,publicAccess:false,role:null,data:emptySnapshot(),pending:[],error:'',connection:'connecting'});}
export function leaveDemo(){if(publicAvailable){void connectPublic();return;}void bootstrap();}
export function startEngine(){if(started)return;started=true;checkingPublic=true;
 restoreAuthReservation();startReservationHandoff(tokens=>supabase.auth.setSession(tokens));
 supabase.auth.onAuthStateChange((event,session)=>{bootSession=session;if(checkingPublic||state.publicAccess)return;if(event==='TOKEN_REFRESHED'){void refresh();return;}if(session){if(state.session?.user.id!==session.user.id||state.mode!=='live')setTimeout(()=>void connect(session),0);}else if(state.mode!=='demo'){++generation;channel?.unsubscribe();channel=null;emit({mode:'login',session:null,publicAccess:false,role:null,data:emptySnapshot(),pending:[]});}});
 if(!reservationLink().requested&&new URLSearchParams(location.search).get('demo')==='1'){checkingPublic=false;enterDemo();}else void bootstrap();
 window.addEventListener('offline',()=>{if(state.mode==='live')emit({connection:'offline'});});
 window.addEventListener('online',()=>{if(state.mode==='live'){subscribe();void refresh().then(flush);}else if(state.mode==='login'&&!state.session)void bootstrap();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.mode==='live')void refresh().then(flush);});
 window.addEventListener('beforeunload',e=>{if(state.pending.some(p=>p.status==='queued')){e.preventDefault();}});
 setInterval(()=>{if(state.mode==='live'&&navigator.onLine)void flush();},15000);
}
