'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2, Save } from 'lucide-react';

interface PickDayInfo {
  fecha: string;
  totalScans: number;
  primerHora: string;
  primerZona: string | null;
  primerProducto: string;
  ultimoHora: string;
  ultimoZona: string | null;
  ultimoProducto: string;
  jornadaSec: number;
  jornadaEfectivaSec: number;
}

function fmtSec(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function PrintInput({ label, value, className = '', id, bold = false }: {
  label: string; value: string; className?: string; id?: string; bold?: boolean;
}) {
  return (
    <div className={`flex items-baseline gap-1.5 ${className}`}>
      <span className={`text-[11px] shrink-0 print:text-[11px] ${bold ? 'font-bold' : 'font-semibold'}`}>{label}:</span>
      <input id={id} className="flex-1 border-b border-slate-400 bg-transparent px-1 py-0.5 text-[11px] print:hidden focus:outline-none focus:border-blue-500" defaultValue={value} />
      <span className="flex-1 hidden print:inline text-[11px] border-b border-slate-400 px-1 py-0.5 print:font-medium">{value || '\u00A0'}</span>
    </div>
  );
}

function TextSection({ label, id, rows = 4, headerColor = 'text-slate-700' }: {
  label: string; id: string; rows?: number; headerColor?: string;
}) {
  return (
    <div>
      <p className={`text-[11px] font-bold mb-1 ${headerColor}`}>{label}</p>
      <textarea id={id} rows={rows} className="w-full border border-slate-300 rounded-sm px-2 py-1.5 text-[10px] leading-relaxed print:hidden focus:outline-none focus:border-blue-500" />
      <div className="hidden print:block border border-slate-300 rounded-sm px-2 py-1.5 min-h-[80px] text-[10px] leading-relaxed whitespace-pre-wrap print:font-medium" data-print-textarea={id} />
    </div>
  );
}

export default function SancionInicioForm() {
  const searchParams = useSearchParams();
  const codUti = searchParams.get('codUti') || '';
  const nomUti = searchParams.get('nomUti') || '';
  const turno = searchParams.get('turno') || '';

  const [picks, setPicks] = useState<PickDayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const picksSorted = React.useMemo(() => {
    return [...picks].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [picks]);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/picks?operator=${codUti}&pageSize=999`);
        if (res.ok) {
          const data = await res.json();
          if (data.rows) {
            setPicks(data.rows.map((r: any) => ({
              fecha: r.fecha, totalScans: r.totalScans,
              primerHora: r.primerHora, primerZona: r.primerZona, primerProducto: r.primerProducto || '',
              ultimoHora: r.ultimoHora, ultimoZona: r.ultimoZona, ultimoProducto: r.ultimoProducto || '',
              jornadaSec: r.jornadaSec, jornadaEfectivaSec: r.jornadaEfectivaSec,
            })));
          }
        }
      } catch (e) {
        console.error('Error loading picks:', e);
      } finally {
        setLoading(false);
      }
    }
    if (codUti) loadData();
    else setLoading(false);
  }, [codUti]);

  const lastError = useRef<string>('');

  const collectAndSend = async (): Promise<boolean> => {
    const evidencia = picksSorted.map(p =>
      `${p.fecha} | ${p.totalScans} esc | 1ro: ${p.primerHora} ${p.primerZona || ''} ${p.primerProducto || ''} | Ult: ${p.ultimoHora} ${p.ultimoZona || ''} ${p.ultimoProducto || ''} | Jornada: ${fmtSec(p.jornadaSec)} | Efectiva: ${fmtSec(p.jornadaEfectivaSec)}`
    ).join('\n');

    const body = {
      codUti, nomUti, turno,
      tiempoNeto: 0,
      fechaMedicion: (document.getElementById('fechaEmision') as HTMLInputElement)?.value || new Date().toISOString().split('T')[0],
      coordinador: (document.getElementById('coordNombre') as HTMLInputElement)?.value || '',
      sectorCoordinador: (document.getElementById('coordSector') as HTMLInputElement)?.value || '',
      rrhh: (document.getElementById('rrhhNombre') as HTMLInputElement)?.value || '',
      evidencia,
      tipo: 'inicio-tardio',
      comentariosColaborador: (document.getElementById('comentColab') as HTMLTextAreaElement)?.value || '',
      comentariosCoordinador: (document.getElementById('comentCoord') as HTMLTextAreaElement)?.value || '',
      sugerencias: (document.getElementById('sugerencias') as HTMLTextAreaElement)?.value || '',
    };

    try {
      const res = await fetch('/api/sanciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); lastError.current = data.error || `HTTP ${res.status}`; return false; }
      lastError.current = '';
      return true;
    } catch (e) { lastError.current = e instanceof Error ? e.message : 'Error de red'; return false; }
  };

  const syncFieldsForPrint = () => {
    const container = formRef.current;
    if (!container) return;
    container.querySelectorAll('textarea').forEach(ta => {
      const printDiv = container.querySelector(`[data-print-textarea="${ta.id}"]`);
      if (printDiv) (printDiv as HTMLElement).textContent = (ta as HTMLTextAreaElement).value;
    });
    container.querySelectorAll('input').forEach(inp => {
      const printSpan = inp.nextElementSibling as HTMLElement | null;
      if (printSpan?.classList.contains('hidden') && printSpan.classList.contains('print:inline')) {
        printSpan.textContent = (inp as HTMLInputElement).value || '\u00A0';
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try { const ok = await collectAndSend(); if (ok) alert('Sancion registrada correctamente'); else alert('Error al guardar: ' + lastError.current); }
    catch (e) { console.error('Error saving:', e); }
    finally { setSaving(false); }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      syncFieldsForPrint();
      const saved = await collectAndSend();
      if (!saved) { alert('Error al guardar: ' + lastError.current); setPrinting(false); return; }
      window.print();
    } catch (e) { console.error('Error printing:', e); alert('Error al guardar/imprimir la sancion.'); }
    finally { setPrinting(false); }
  };

  if (loading) {
    return (<div className="flex items-center justify-center min-h-screen bg-white"><Loader2 className="h-8 w-8 animate-spin text-red-500" /></div>);
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-white print:bg-white" ref={formRef}>
      {/* SCREEN-ONLY TOOLBAR */}
      <div className="print:hidden flex items-center gap-3 px-4 py-2.5 border-b bg-white sticky top-0 z-10 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Button>
        <h1 className="text-sm font-bold text-slate-700">Sancion por Inicio Tardio</h1>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1 text-xs border-green-400 text-green-700 hover:bg-green-50">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
        </Button>
        <Button size="sm" onClick={handlePrint} disabled={printing} className="bg-red-600 text-white hover:bg-red-700 gap-1 text-xs">
          {printing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />} Imprimir y Registrar
        </Button>
      </div>

      <div className="max-w-[210mm] mx-auto print:max-w-none print:mx-0 print:p-0 px-6 py-4 print:px-0 print:py-0">
        {/* HEADER IMAGE */}
        <div className="print:m-[12mm_15mm_0_15mm] mb-2 print:mb-0">
          <img src="/header-bg.png" alt="" className="w-full h-auto object-contain print:object-cover" style={{ maxWidth: '100%' }} />
        </div>

        {/* TITLE */}
        <div className="text-center mt-2 mb-4 print:mt-3 print:mb-4 print:mx-[15mm]">
          <h1 className="text-sm font-bold tracking-wider print:text-[14pt] uppercase">Pedido de Explicacion - Inicio Tardio</h1>
        </div>

        {/* TWO-COLUMN DATA TABLE */}
        <div className="print:mx-[15mm] mb-4">
          <table className="w-full border-collapse text-[11px] print:text-[11pt]">
            <thead>
              <tr className="border-b-2 border-slate-800">
                <th className="text-left py-1 px-2 font-bold text-[11px] print:text-[11pt] border-r border-slate-800 w-1/2">Datos del Colaborador</th>
                <th className="text-left py-1 px-2 font-bold text-[11px] print:text-[11pt] w-1/2">Datos de Coordinadores</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-300"><td className="py-1 px-2 border-r border-slate-300"><PrintInput label="Apellido y Nombre" value={nomUti} /></td><td className="py-1 px-2"><PrintInput label="Apellido y Nombre" value="" id="coordNombre" /></td></tr>
              <tr className="border-b border-slate-300"><td className="py-1 px-2 border-r border-slate-300"><PrintInput label="Legajo" value={codUti} /></td><td className="py-1 px-2"><PrintInput label="Sector" value="" id="coordSector" /></td></tr>
              <tr className="border-b border-slate-300"><td className="py-1 px-2 border-r border-slate-300"><div className="flex items-baseline gap-1.5"><span className="text-[11px] font-semibold shrink-0">Sector:</span><span className="text-[11px] font-bold print:text-[11pt]">PREPARACION</span></div></td><td className="py-1 px-2"><span className="text-[11px] font-semibold">Interviene por RR.HH.</span></td></tr>
              <tr className="border-b border-slate-300"><td className="py-1 px-2 border-r border-slate-300"><div className="flex items-baseline gap-1.5"><span className="text-[11px] font-semibold shrink-0">Funcion:</span><span className="text-[11px] font-bold print:text-[11pt]">PREPARADOR</span></div></td><td className="py-1 px-2"><PrintInput label="Apellido y Nombre" value="" id="rrhhNombre" /></td></tr>
              <tr className="border-b border-slate-300"><td className="py-1 px-2 border-r border-slate-300"><div className="flex items-baseline gap-1.5"><span className="text-[11px] font-semibold shrink-0">Turno:</span><span className="text-[11px] font-bold print:text-[11pt]">{turno}</span></div></td><td className="py-1 px-2"></td></tr>
            </tbody>
          </table>
        </div>

        {/* DATE ROW */}
        <div className="print:mx-[15mm] mb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold shrink-0">Fecha</span>
            <span className="text-[9px] text-slate-400 print:hidden">(colocar la fecha en que se emite el documento)</span>
            <input id="fechaEmision" type="date" className="flex-1 border-b border-slate-400 bg-transparent px-1 py-0.5 text-[11px] print:hidden focus:outline-none focus:border-blue-500" defaultValue={today} />
            <span className="flex-1 hidden print:inline text-[11px] border-b border-slate-400 px-1 py-0.5 font-medium">{today}</span>
          </div>
        </div>

        {/* EVIDENCIA DEL CASO */}
        <div className="print:mx-[15mm] mb-4">
          <div className="border border-slate-400 rounded-sm">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-400 flex items-center justify-between">
              <span className="text-[11px] font-bold print:text-[12pt]">Evidencia del Caso</span>
            </div>
            <div className="px-3 py-1.5 border-b border-slate-300">
              <p className="text-[11px] font-bold print:text-[11pt]">Incidencia Proceso Operaciones</p>
              <p className="text-[10px]" style={{ color: '#555' }}>Inicio tardio de jornada</p>
            </div>

            {/* Picks table - Screen */}
            <div className="p-3 print:hidden overflow-x-auto">
              {picks.length > 0 ? (
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr className="bg-blue-50">
                      <th className="border border-blue-200 px-2 py-1 text-left font-semibold text-blue-800">Fecha</th>
                      <th className="border border-blue-200 px-2 py-1 text-center font-semibold text-blue-800">Escaneos</th>
                      <th className="border border-blue-200 px-2 py-1 text-center font-semibold text-blue-800" colSpan={3}>Primer Pikeo</th>
                      <th className="border border-blue-200 px-2 py-1 text-center font-semibold text-blue-800">Jornada</th>
                      <th className="border border-blue-200 px-2 py-1 text-center font-semibold text-blue-800">Efectiva</th>
                      <th className="border border-blue-200 px-2 py-1 text-center font-semibold text-green-800" colSpan={3}>Ultimo Pikeo</th>
                    </tr>
                    <tr className="bg-blue-50/50">
                      <th className="border border-blue-100"></th>
                      <th className="border border-blue-100"></th>
                      <th className="border border-blue-100 text-[8px] text-blue-500">Hora</th>
                      <th className="border border-blue-100 text-[8px] text-blue-500">Zona</th>
                      <th className="border border-blue-100 text-[8px] text-blue-500">Producto</th>
                      <th className="border border-blue-100"></th>
                      <th className="border border-blue-100"></th>
                      <th className="border border-green-100 text-[8px] text-green-500">Hora</th>
                      <th className="border border-green-100 text-[8px] text-green-500">Zona</th>
                      <th className="border border-green-100 text-[8px] text-green-500">Producto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picksSorted.map(p => (
                      <tr key={p.fecha} className="hover:bg-slate-50">
                        <td className="border border-slate-200 px-2 py-1 font-medium">{p.fecha}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center font-mono font-bold">{p.totalScans}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center font-mono text-blue-700 bg-blue-50/30">{p.primerHora}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center bg-blue-50/30">
                          <span className="inline-block px-1 py-0.5 rounded bg-blue-200 text-blue-800 text-[8px] font-semibold">{p.primerZona || '—'}</span>
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center font-mono text-[8px] text-blue-600 max-w-[100px] truncate">{p.primerProducto || '—'}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center text-muted-foreground">{fmtSec(p.jornadaSec)}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center font-medium">{fmtSec(p.jornadaEfectivaSec)}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center font-mono text-green-700 bg-green-50/30">{p.ultimoHora}</td>
                        <td className="border border-slate-200 px-2 py-1 text-center bg-green-50/30">
                          <span className="inline-block px-1 py-0.5 rounded bg-green-200 text-green-800 text-[8px] font-semibold">{p.ultimoZona || '—'}</span>
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center font-mono text-[8px] text-green-600 max-w-[100px] truncate">{p.ultimoProducto || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-[10px] text-slate-400 italic">Sin datos de pikeo para este operador.</p>
              )}
            </div>

            {/* Picks table - Print */}
            <div className="hidden print:block p-3">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #999' }}>
                    <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'left' }}>Fecha</th>
                    <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Esc.</th>
                    <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center', color: '#2563eb' }} colSpan={3}>Primer Pikeo</th>
                    <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Jornada</th>
                    <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Efectiva</th>
                    <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center', color: '#16a34a' }} colSpan={3}>Ultimo Pikeo</th>
                  </tr>
                  <tr>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#666' }}></th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#666' }}></th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#60a5fa' }}>Hora</th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#60a5fa' }}>Zona</th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#60a5fa' }}>Producto</th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#666' }}></th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#666' }}></th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#4ade80' }}>Hora</th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#4ade80' }}>Zona</th>
                    <th style={{ border: '1px solid #bbb', fontSize: '7px', color: '#4ade80' }}>Producto</th>
                  </tr>
                </thead>
                <tbody>
                  {picksSorted.map(p => (
                    <tr key={p.fecha} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px' }}>{p.fecha}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px', textAlign: 'center', fontWeight: 'bold' }}>{p.totalScans}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px', textAlign: 'center', color: '#2563eb' }}>{p.primerHora}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px', textAlign: 'center' }}>{p.primerZona || '-'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px' }}>{p.primerProducto || '-'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px', textAlign: 'center' }}>{fmtSec(p.jornadaSec)}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px', textAlign: 'center' }}>{fmtSec(p.jornadaEfectivaSec)}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px', textAlign: 'center', color: '#16a34a' }}>{p.ultimoHora}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px', textAlign: 'center' }}>{p.ultimoZona || '-'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '1px 3px' }}>{p.ultimoProducto || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 2 — COMMENTS & SIGNATURES */}
        <div style={{ pageBreakBefore: 'always' }} className="print:mx-[15mm] print:mt-[12mm]">
          <div className="hidden print:block print:mb-3"><img src="/header-bg.png" alt="" className="w-full h-auto object-contain" /></div>
          <div className="mb-5"><TextSection label="Comentarios del Colaborador" id="comentColab" rows={5} headerColor="text-slate-800" /></div>
          <div className="mb-5"><TextSection label="Comentarios del Coordinador" id="comentCoord" rows={5} headerColor="text-slate-800" /></div>
          <div className="mb-6"><TextSection label="Sugerencias / Mejora / Compromiso" id="sugerencias" rows={4} headerColor="text-slate-800" /></div>
          <div className="mt-10">
            <table className="w-full border-collapse text-[11px] print:text-[11pt]">
              <tbody>
                <tr>
                  <td className="text-center py-8 w-1/3"><div className="border-b border-slate-800 mb-1 mx-4" style={{ height: '60px' }}></div><p className="text-[11px] font-bold">Firma de Colaborador</p></td>
                  <td className="text-center py-8 w-1/3"><div className="border-b border-slate-800 mb-1 mx-4" style={{ height: '60px' }}></div><p className="text-[11px] font-bold">Firma del Coordinador</p></td>
                  <td className="text-center py-8 w-1/3"><div className="border-b border-slate-800 mb-1 mx-4" style={{ height: '60px' }}></div><p className="text-[11px] font-bold">Firma de RR.HH.</p></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER IMAGE */}
        <div className="print:m-[0_15mm_12mm_15mm] mt-4 print:mt-0">
          <img src="/footer-bg.png" alt="" className="w-full h-auto object-contain" style={{ maxWidth: '100%' }} />
        </div>
      </div>
    </div>
  );
}
