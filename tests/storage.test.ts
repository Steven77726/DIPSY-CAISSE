import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {saveOperation,readOperations,deleteOperation,saveCache,readCache} from '../src/lib/storage';
import {emptySnapshot} from '../src/lib/domain';
import type {Operation} from '../src/lib/domain';
it('la file est persistée avant le réseau, reste relisible et est isolée par utilisateur',async()=>{
 const op:Operation={id:crypto.randomUUID(),actor:'a',kind:'pay',entityId:'order',baseVersion:1,payload:{payments:[{method:'cash',amount_cents:500}]},status:'queued',createdAt:new Date().toISOString()};
 await saveOperation('a',op);expect(await readOperations('a')).toEqual([op]);expect(await readOperations('b')).toEqual([]);
 await saveOperation('a',op);expect((await readOperations('a')).length).toBe(1);
 await saveCache('a',emptySnapshot());expect(await readCache('a')).toEqual(emptySnapshot());expect(await readCache('b')).toBeUndefined();
 await deleteOperation('a',op.id);expect(await readOperations('a')).toEqual([]);
});
