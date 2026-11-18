import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import TicketLines from '../src/components/TicketLines';
import type {Line} from '../src/lib/domain';

const lines:Line[]=Array.from({length:18},(_,i)=>({id:`line-${i}`,order_id:'order',product_id:`product-${i}`,name:`Article ${i+1} · grande assiette à partager avec accompagnement et intitulé complet`,reference:`REF-${i+1}`,quantity:i===17?3:1,unit_price_cents:1200,vat_bps:1000,accounting_group:'food',total_cents:i===17?3600:1200,net_cents:1091}));
const render=(locked=false)=>renderToStaticMarkup(createElement(TicketLines,{lines,canCorrect:true,quantityDisabled:locked,correctionDisabled:locked,onQuantity:()=>{},onCorrect:()=>{}}));
it('rend toutes les lignes et les intitulés complets, y compris la dernière ligne et son montant cumulé',()=>{
 const html=render();expect(html.match(/role="listitem"/g)).toHaveLength(18);
 for(const line of lines){expect(html).toContain(line.name);expect(html).toContain(`Réf. ${line.reference}`);}
 expect(html.replace(/<[^>]+>/g,' ')).toContain('3 × 12,00 € · TVA 10 %');expect(html).toContain('36,00 €');
});
it('conserve les détails lisibles après un paiement sans permettre de changer les quantités ou les articles',()=>{
 const html=render(true);expect(html.match(/disabled=""/g)).toHaveLength(54);
 expect(html).toContain(lines[17].name);expect(html).toContain('36,00 €');
});
