import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {exportAccounting} from '../src/lib/exports';
import {demoSnapshot} from '../src/lib/demo';
import {accounting,parisDay} from '../src/lib/domain';
let downloaded:Blob;
function browser(){vi.spyOn(URL,'createObjectURL').mockImplementation(blob=>{downloaded=blob as Blob;return 'blob:test';});vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.stubGlobal('document',{createElement:()=>({click(){},href:'',download:''})});vi.spyOn(globalThis,'setTimeout').mockImplementation((()=>0) as any);}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-16T18:00:00Z'));});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('le CSV protège les cellules injectables et contient les règlements ventilés',async()=>{browser();const s=demoSnapshot();s.lines.forEach(l=>{l.name='=HYPERLINK("test")';});await exportAccounting(s,parisDay(),parisDay(),'csv');const text=await downloaded.text();expect(text).toContain('TTC encaissé EUR');expect(text).toContain("'=HYPERLINK");expect(text).toContain('"TVA %"');expect(text).toContain(';');});
it('le vrai classeur XLSX contient des montants numériques et des totaux réconciliables',async()=>{browser();const s=demoSnapshot();await exportAccounting(s,parisDay(),parisDay(),'xlsx');const ExcelJS=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await downloaded.arrayBuffer());expect(workbook.worksheets.map(s=>s.name)).toEqual(['Synthèse','Commandes','Lignes','Règlements','Ventilation TVA']);const sheet=workbook.getWorksheet('Règlements')!;let cents=0;sheet.eachRow((row,n)=>{if(n>1){expect(typeof row.getCell(8).value).toBe('number');cents+=Math.round(Number(row.getCell(8).value)*100);}});expect(cents).toBe(accounting(s,parisDay(),parisDay()).total.gross);expect(workbook.getWorksheet('Synthèse')!.getCell('B4').value).toBe(cents/100);});
