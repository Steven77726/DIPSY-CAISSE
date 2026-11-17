import type {Category,Product,ProductOrder} from './domain';
import {categories} from './domain';

// Older products remain intact and appear with the dishes, including after restore.
export const menuCategory=(category:Category)=>category==='entrees'||category==='desserts'?'plats':category;
export function sortProducts(products:Product[],orders:ProductOrder[]=[]):Product[]{
 const categoryPositions=new Map(categories.map((c,i)=>[c.id,i]));
 const positions=new Map(orders.map(o=>[o.category,new Map(o.product_ids.map((id,i)=>[id,i]))]));
 return [...products].sort((a,b)=>{
  const ca=menuCategory(a.category),cb=menuCategory(b.category);
  return (categoryPositions.get(ca)??99)-(categoryPositions.get(cb)??99)
   ||(positions.get(ca)?.get(a.id)??Infinity)-(positions.get(cb)?.get(b.id)??Infinity)
   ||a.name.localeCompare(b.name,'fr')||a.id.localeCompare(b.id);
 });
}
export function movedProductIds(products:Product[],orders:ProductOrder[]|undefined,id:string,step:number):string[]|null{
 const product=products.find(p=>p.id===id);if(!product)return null;
 const peers=sortProducts(products,orders).filter(p=>menuCategory(p.category)===menuCategory(product.category));
 const index=peers.findIndex(p=>p.id===id),target=index+step;if(target<0||target>=peers.length)return null;
 const ids=peers.map(p=>p.id);[ids[index],ids[target]]=[ids[target],ids[index]];return ids;
}
export function readLegacyProductOrder():string[]{
 try{const value=JSON.parse(localStorage.getItem('dipsy-product-order')||'[]');return Array.isArray(value)?[...new Set(value.filter((x):x is string=>typeof x==='string'))]:[];}catch{return [];}
}
// Only import a meaningful local ordering into a category never ordered on the server.
export function legacyOrderCandidate(products:Product[],order:ProductOrder,legacy:string[]):string[]|null{
 if(order.version!==0)return null;
 const peers=sortProducts(products).filter(p=>menuCategory(p.category)===order.category).map(p=>p.id);
 const local=legacy.filter(id=>peers.includes(id));if(local.length<2)return null;
 const ids=[...local,...peers.filter(id=>!local.includes(id))];return ids.some((id,i)=>id!==peers[i])?ids:null;
}
