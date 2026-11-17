import {it,expect,vi,afterEach} from 'vitest';
import {reservationLink,startReservationHandoff,tablesOrigin} from '../src/lib/reservation-link';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('ne prend comme liaison qu’un UUID de réservation, jamais un nom ou un téléphone',()=>{expect(reservationLink('?name=Jean&phone=0600000000').requested).toBe(false);expect(reservationLink('?reservation_id=Jean')).toEqual({requested:true,id:null});expect(reservationLink('?reservation_id=11111111-2222-4333-8444-555555555555').id).toBe('11111111-2222-4333-8444-555555555555');});
it('refuse une transmission de session venant d’une autre origine, d’un autre onglet ou d’un autre nonce',async()=>{
 const opener={postMessage:vi.fn()},target=Object.assign(new EventTarget(),{opener});vi.stubGlobal('window',target);vi.stubGlobal('location',{search:'?reservation_id=11111111-2222-4333-8444-555555555555'});const accept=vi.fn().mockResolvedValue({});const stop=startReservationHandoff(accept);const request=opener.postMessage.mock.calls[0][0];expect(opener.postMessage.mock.calls[0][1]).toBe(tablesOrigin);
 const send=(origin:string,source:unknown,nonce=request.nonce)=>{const e=new Event('message');Object.assign(e,{origin,source,data:{type:'DIPSY_TABLES_AUTH',reservation_id:request.reservation_id,nonce,access_token:'test-access',refresh_token:'test-refresh'}});target.dispatchEvent(e);};
 send('https://evil.test',opener);send(tablesOrigin,{});send(tablesOrigin,opener,'wrong');expect(accept).not.toHaveBeenCalled();send(tablesOrigin,opener);send(tablesOrigin,opener);expect(accept).toHaveBeenCalledTimes(1);expect(accept).toHaveBeenCalledWith({access_token:'test-access',refresh_token:'test-refresh'});await Promise.resolve();expect(target.opener).toBe(null);stop();
});
