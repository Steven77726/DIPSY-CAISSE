import {it,expect,vi,afterEach} from 'vitest';
import type {Product,ProductOrder} from '../src/lib/domain';
import {categories} from '../src/lib/domain';
import {sortProducts,movedProductIds,legacyOrderCandidate,readLegacyProductOrder} from '../src/lib/product-order';
const product=(id:string,category:Product['category'],name=id):Product=>({id,name,category,price_cents:34900,vat_bps:1000,accounting_group:'food',active:true,version:4});
const order:ProductOrder={id:'order',category:'plats',product_ids:['b','a'],version:1};
afterEach(()=>vi.unstubAllGlobals());
it('affiche les cinq rubriques demandées et conserve les anciens produits avec les plats',()=>{
 expect(categories.filter(c=>c.id!=='all').map(c=>c.name)).toEqual(['Plats','Vins','Cocktails','Boissons','Alcool']);
 expect(sortProducts([product('wine','vins'),product('old','entrees'),product('dessert','desserts'),product('dish','plats')]).map(p=>p.id)).toEqual(['dessert','dish','old','wine']);
});
it('le classement serveur est commun aux vues, sans modifier prix, TVA ou versions',()=>{
 const products=[product('a','plats'),product('b','plats'),product('drink','boissons')];const before=structuredClone(products);
 expect(sortProducts(products,[order]).map(p=>p.id)).toEqual(['b','a','drink']);expect(movedProductIds(products,[order],'b',1)).toEqual(['a','b']);expect(movedProductIds(products,[order],'b',-1)).toBeNull();expect(products).toEqual(before);
});
it('un nouveau produit et un article archivé restent dans le classement sans être masqués',()=>{
 const products=[product('a','plats'),{...product('b','plats'),active:false},product('c','plats')];
 expect(sortProducts(products,[order]).map(p=>p.id)).toEqual(['b','a','c']);expect(movedProductIds(products,[order],'a',1)).toEqual(['b','c','a']);
});
it('importe un ancien ordre local une seule fois et ne remplace jamais un ordre serveur existant',()=>{
 const products=[product('a','plats'),product('b','plats'),product('new','plats')];
 expect(legacyOrderCandidate(products,{...order,version:0,product_ids:[]},['unknown','b','a'])).toEqual(['b','a','new']);expect(legacyOrderCandidate(products,order,['a','b'])).toBeNull();
});
it('un ancien stockage illisible ne bloque pas la carte',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>'{invalid'});expect(readLegacyProductOrder()).toEqual([]);vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(['a','a',null,'b'])});expect(readLegacyProductOrder()).toEqual(['a','b']);
});
