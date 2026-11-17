export const reservationUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const tablesOrigin='https://dispychic.github.io';
export function reservationLink(search=location.search){const p=new URLSearchParams(search);const raw=p.get('reservation_id');return {requested:p.has('reservation_id'),id:raw&&reservationUuid.test(raw)?raw.toLowerCase():null};}
export function authReturnUrl(){const url=new URL(import.meta.env.BASE_URL,location.origin);const {id}=reservationLink();if(id)localStorage.setItem('dipsy-auth-reservation-return',JSON.stringify({id,at:Date.now()}));return url.href;}
export function restoreAuthReservation(){
 if(reservationLink().requested||!(/access_token=|type=recovery/.test(location.hash||'')||new URLSearchParams(location.search).has('code')))return;
 try{const saved=JSON.parse(localStorage.getItem('dipsy-auth-reservation-return')||'null');if(saved&&reservationUuid.test(saved.id)&&Date.now()-saved.at<1800000){const url=new URL(location.href);url.searchParams.set('reservation_id',saved.id);history.replaceState(null,'',url.href);}localStorage.removeItem('dipsy-auth-reservation-return');}catch{}
}
// Tokens never travel in URLs. Accept one response from the exact opener and origin.
export function startReservationHandoff(accept:(tokens:{access_token:string;refresh_token:string})=>Promise<unknown>){
 const {id}=reservationLink();const opener=window.opener;if(!id||!opener)return()=>{};
 const nonce=crypto.randomUUID();let used=false;
 const stop=()=>{window.removeEventListener('message',receive);clearTimeout(timeout);};
 const receive=(event:MessageEvent)=>{
  const value=event.data;if(used||event.origin!==tablesOrigin||event.source!==opener||value?.type!=='DIPSY_TABLES_AUTH'||value.reservation_id!==id||value.nonce!==nonce||typeof value.access_token!=='string'||typeof value.refresh_token!=='string')return;
  used=true;stop();void accept({access_token:value.access_token,refresh_token:value.refresh_token}).finally(()=>{window.opener=null;});
 };
 window.addEventListener('message',receive);const timeout=setTimeout(stop,30000);
 opener.postMessage({type:'DIPSY_CAISSE_AUTH_REQUEST',reservation_id:id,nonce},tablesOrigin);return stop;
}
