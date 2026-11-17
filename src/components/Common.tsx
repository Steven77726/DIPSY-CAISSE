import {useEffect,useId,useRef} from 'react';
import type {ReactNode} from 'react';
import {X,ArrowUpRight,Inbox,Check} from 'lucide-react';
import type {Status} from '../lib/domain';
import {statusNames} from '../lib/domain';
export function Badge({status}:{status:Status}){return <span className={`badge ${status}`}><i/>{statusNames[status]}</span>;}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><span className="empty-icon"><Inbox size={28}/></span><h3>{title}</h3><p>{children}</p></div>;}
export function Modal({title,subtitle,children,onClose,wide=false}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);const titleId=useId();useEffect(()=>{const dialog=ref.current;dialog?.showModal();document.body.classList.add('dialog-open');return()=>{dialog?.close();if(!document.querySelector('dialog[open]'))document.body.classList.remove('dialog-open');};},[]);
 return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-top"><div><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-btn" aria-label="Fermer" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
export function Stat({label,value,sub,icon,green=false}:{label:string;value:string;sub?:string;icon:ReactNode;green?:boolean}){return <div className={`stat ${green?'green':''}`}><div className="stat-top"><span>{label}</span>{icon}</div><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>;}
export function SectionLabel({children}:{children:ReactNode}){return <div className="section-label">{children}<ArrowUpRight size={15}/></div>;}
export function Saved(){return <span className="saved"><Check size={13}/> Confirmé par le serveur</span>;}
