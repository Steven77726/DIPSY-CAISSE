import {useState} from 'react';
import {Plus,Pencil,ArrowUp,ArrowDown} from 'lucide-react';
import type {Product} from '../lib/domain';
import {categories,euro} from '../lib/domain';
import {getEngine,useEngine,submit,notify} from '../lib/engine';
import {sortProducts,menuCategory,movedProductIds} from '../lib/product-order';
import {Empty} from './Common';
import OperationNotice from './OperationNotice';

export default function ProductCatalog({onEdit,onCreate}:{onEdit:(p:Product)=>void;onCreate:()=>void}){
 const {data,pending,mode}=useEngine();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const products=sortProducts(data.products,data.product_order);
 const operations=pending.filter(p=>p.kind==='reorder_products');
 const blocked=busy||operations.length>0;
 async function move(id:string,step:number){
  if(blocked)return;const state=getEngine(),product=state.data.products.find(p=>p.id===id);if(!product)return;
  const order=state.data.product_order?.find(o=>o.category===menuCategory(product.category));
  const ids=movedProductIds(state.data.products,state.data.product_order,id,step);if(!ids)return;
  if(!order){setError('Actualisez la caisse pour charger le classement partagé.');return;}
  setBusy(true);setError('');try{
   const result=await submit('reorder_products',order.id,order.version,{product_ids:ids});
   notify(result==='queued'?'Classement conservé sur cet appareil · confirmation en attente':mode==='demo'?'Classement modifié dans la démo':'Classement enregistré · partagé entre vos appareils');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="panel product-catalog"><div className="panel-title"><div><h2>Votre carte</h2><p>Utilisez ↑ ↓ pour choisir l’ordre des articles dans chaque rubrique.</p></div><button className="btn primary compact" onClick={onCreate}><Plus size={16}/>Ajouter un produit</button></div>
  <p className="catalog-sync-note">{mode==='demo'?'Classement de démonstration':operations.length||busy?'Classement en attente de confirmation':'Classement partagé entre vos appareils'}</p>
  {operations.map(op=><OperationNotice key={op.id} operation={op} resumeLabel="Actualiser et reprendre le classement" onResolved={()=>setError('')}/>)}
  {error&&!operations.length&&<p className="form-error" role="alert">{error}</p>}
  <div className="table-scroll"><table><thead><tr><th>Produit</th><th>Rubrique</th><th>Prix TTC</th><th>TVA</th><th>Disponibilité</th><th>Ordre</th><th/></tr></thead><tbody>{products.map(p=>{
   const peers=products.filter(x=>menuCategory(x.category)===menuCategory(p.category)),index=peers.findIndex(x=>x.id===p.id);
   return <tr key={p.id}><td className="catalog-product-name"><strong>{p.name}</strong>{p.reference&&<small>Réf. {p.reference}</small>}</td><td data-label="Rubrique">{categories.find(c=>c.id===menuCategory(p.category))?.name}</td><td data-label="Prix TTC">{euro(p.price_cents)}</td><td data-label="TVA">{p.vat_bps/100} %</td><td data-label="Disponibilité"><span className={`badge ${p.active?'paid':'cancelled'}`}>{p.active?'Actif':'Archivé'}</span></td><td data-label="Ordre dans la rubrique"><div className="product-order-controls"><button className="icon-btn" disabled={blocked||index===0} title="Monter" aria-label={`Monter ${p.name}`} onClick={()=>void move(p.id,-1)}><ArrowUp size={18}/></button><button className="icon-btn" disabled={blocked||index===peers.length-1} title="Descendre" aria-label={`Descendre ${p.name}`} onClick={()=>void move(p.id,1)}><ArrowDown size={18}/></button></div></td><td className="catalog-product-edit"><button className="icon-btn" onClick={()=>onEdit(p)} aria-label={`Modifier ${p.name}`}><Pencil size={17}/><span className="catalog-edit-label">Modifier</span></button></td></tr>;
  })}</tbody></table></div>{!products.length&&<Empty title="À vous de composer la carte">Aucun produit fictif n’a été ajouté à votre caisse réelle.</Empty>}
 </div>;
}
