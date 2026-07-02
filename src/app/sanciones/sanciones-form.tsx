'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';

interface GapItem { fecha: string; prevHora: string; currHora: string; gapSeconds: number; prevZonSts: string | null; currZonSts: string | null; }
interface TmInfData { totalMinutos: number; registros: number; }

function fmtSec(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function PrintInput({ label, value, className = '', id }: { label: string; value: string; className?: string; id?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] text-muted-foreground mb-0.5 print:hidden">{label}</label>
      <input id={id} className="w-full border border-slate-300 rounded px-2 py-1 text-xs print:hidden" defaultValue={value} />
      <span className="hidden print:block text-xs font-medium">{value}</span>
    </div>
  );
}

function TextSection({ label, id, rows = 3 }: { label: string; id: string; rows?: number }) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-0.5 print:hidden">{label}</label>
      <textarea id={id} rows={rows} className="w-full border border-slate-300 rounded px-2 py-1 text-xs print:hidden" />
      <div className="hidden print:block border-t border-slate-300 pt-1 mt-1 text-xs whitespace-pre-wrap" data-print-textarea={id}></div>
    </div>
  );
}

export default function SancionesForm() {
  const searchParams = useSearchParams();
  const codUti = searchParams.get('codUti') || '';
  const nomUti = searchParams.get('nomUti') || '';
  const turno = searchParams.get('turno') || '';
  const tiempoNetoMin = searchParams.get('tiempoNetoMin') || '0';
  const fechaMedicion = searchParams.get('fechaMedicion') || '';

  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [tmInf, setTmInf] = useState<TmInfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const params = new URLSearchParams({ operator: codUti, pageSize: '999' });
        const [movRes, tmInfRes] = await Promise.all([
          fetch(`/api/movements?${params}`),
          fetch('/api/tm-informados'),
        ]);
        const movData = await movRes.json();
        if (movData.rows) {
          setGaps(movData.rows.map((r: any) => ({
            fecha: r.fecha, prevHora: r.prevHora, currHora: r.currHora,
            gapSeconds: r.gapSeconds, prevZonSts: r.prevZonSts, currZonSts: r.currZonSts,
          })));
        }
        if (tmInfRes.ok) {
          const tmData = await tmInfRes.json();
          if (tmData.byOperator?.[codUti]) {
            setTmInf(tmData.byOperator[codUti]);
          }
        }
      } catch (e) {
        console.error('Error loading data:', e);
      } finally {
        setLoading(false);
      }
    }
    if (codUti) loadData();
    else setLoading(false);
  }, [codUti]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      // Copy textarea values to print divs
      const textareas = formRef.current?.querySelectorAll('textarea');
      textareas?.forEach(ta => {
        const printDiv = formRef.current?.querySelector(`[data-print-textarea="${ta.id}"]`);
        if (printDiv) (printDiv as HTMLElement).textContent = ta.value;
      });

      // Copy input values to print spans
      const inputs = formRef.current?.querySelectorAll('input');
      inputs?.forEach(inp => {
        const nextSpan = inp.nextElementSibling as HTMLElement | null;
        if (nextSpan && nextSpan.classList.contains('hidden')) {
          nextSpan.textContent = (inp as HTMLInputElement).value;
        }
      });

      // Register sancion
      await fetch('/api/sanciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codUti, nomUti, turno,
          tiempoNeto: Number(tiempoNetoMin),
          fechaMedicion,
          coordinador: (document.getElementById('coordinador') as HTMLInputElement)?.value || '',
          sectorCoordinador: (document.getElementById('sector') as HTMLInputElement)?.value || '',
          rrhh: (document.getElementById('rrhh') as HTMLInputElement)?.value || '',
          evidencia: gaps.map(g => `${g.fecha} | ${g.prevHora} - ${g.currHora} | ${fmtSec(g.gapSeconds)} | ${g.prevZonSts || '?'} → ${g.currZonSts || '?'}`).join('\n'),
          comentariosColaborador: (document.getElementById('comentColab') as HTMLTextAreaElement)?.value || '',
          comentariosCoordinador: (document.getElementById('comentCoord') as HTMLTextAreaElement)?.value || '',
          sugerencias: (document.getElementById('sugerencias') as HTMLTextAreaElement)?.value || '',
        }),
      });

      window.print();
    } catch (e) {
      console.error('Error printing:', e);
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white print:p-0" ref={formRef}>
      {/* Screen-only header */}
      <div className="print:hidden flex items-center gap-3 p-4 border-b bg-white sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <h1 className="text-sm font-bold">Sanción Disciplinaria</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={handlePrint} disabled={printing} className="bg-red-500 text-white hover:bg-red-600 gap-1">
          {printing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
          Imprimir y Registrar
        </Button>
      </div>

      {/* ===== PAGE 1: EVIDENCIA ===== */}
      <div className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-base font-bold uppercase tracking-wide">
            Notificación de Medida Disciplinaria por Tiempos Muertos
          </h1>
          <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
            <PrintInput label="Fecha de Preparación" value={fechaMedicion || new Date().toISOString().split('T')[0]} className="w-40" />
          </div>
        </div>

        {/* Colaborador info */}
        <div className="border border-slate-300 rounded-lg p-4 mb-4">
          <h2 className="text-xs font-bold mb-3 border-b pb-1">DATOS DEL COLABORADOR</h2>
          <div className="grid grid-cols-3 gap-4">
            <PrintInput label="Apellido y Nombre" value={nomUti} />
            <PrintInput label="Legajo" value={codUti} />
            <PrintInput label="Turno" value={turno} />
          </div>
        </div>

        {/* Tiempos */}
        <div className="border border-slate-300 rounded-lg p-4 mb-4">
          <h2 className="text-xs font-bold mb-3 border-b pb-1">RESUMEN DE TIEMPOS</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="block text-[10px] text-muted-foreground print:hidden">Tiempo Neto</span>
              <span className="text-lg font-bold text-red-600">{Number(tiempoNetoMin).toFixed(1)} min</span>
            </div>
            {tmInf && tmInf.totalMinutos > 0 && (
              <div>
                <span className="block text-[10px] text-muted-foreground print:hidden">TM Informados</span>
                <span className="text-lg font-bold text-purple-600">{tmInf.totalMinutos} min</span>
                <div className="text-[10px] text-purple-500">{tmInf.registros} eventos</div>
              </div>
            )}
          </div>
        </div>

        {/* Evidence table */}
        <div className="border border-slate-300 rounded-lg p-4 mb-4">
          <h2 className="text-xs font-bold mb-3 border-b pb-1">EVIDENCIA DEL CASO - {nomUti} ({codUti})</h2>

          {/* Screen: textarea */}
          <textarea
            className="w-full border border-slate-300 rounded p-2 text-[11px] font-mono print:hidden"
            rows={Math.min(gaps.length + 2, 20)}
            readOnly
            value={gaps.length > 0
              ? 'Fecha       | Hora Inicio | Hora Fin   | Duración  | Zona Origen → Zona Destino\n' +
                '------------|-------------|------------|-----------|--------------------------\n' +
                gaps.map(g =>
                  `${g.fecha} | ${g.prevHora}    | ${g.currHora}    | ${fmtSec(g.gapSeconds).padEnd(9)} | ${(g.prevZonSts || '?').padEnd(10)} → ${g.currZonSts || '?'}`
                ).join('\n')
              : 'Sin eventos de tiempo muerto registrados para este operador.'
            }
          />

          {/* Print: HTML table */}
          <div className="hidden print:block">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #000' }}>
                  <th style={{ border: '1px solid #999', padding: '3px', textAlign: 'left' }}>#</th>
                  <th style={{ border: '1px solid #999', padding: '3px', textAlign: 'left' }}>Fecha</th>
                  <th style={{ border: '1px solid #999', padding: '3px', textAlign: 'center' }}>Hora Inicio</th>
                  <th style={{ border: '1px solid #999', padding: '3px', textAlign: 'center' }}>Hora Fin</th>
                  <th style={{ border: '1px solid #999', padding: '3px', textAlign: 'center' }}>Duración</th>
                  <th style={{ border: '1px solid #999', padding: '3px', textAlign: 'center' }}>Zona Origen</th>
                  <th style={{ border: '1px solid #999', padding: '3px', textAlign: 'center' }}>Zona Destino</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
                    <td style={{ border: '1px solid #ddd', padding: '2px 3px' }}>{i + 1}</td>
                    <td style={{ border: '1px solid #ddd', padding: '2px 3px' }}>{g.fecha}</td>
                    <td style={{ border: '1px solid #ddd', padding: '2px 3px', textAlign: 'center' }}>{g.prevHora}</td>
                    <td style={{ border: '1px solid #ddd', padding: '2px 3px', textAlign: 'center' }}>{g.currHora}</td>
                    <td style={{ border: '1px solid #ddd', padding: '2px 3px', textAlign: 'center', fontWeight: 'bold' }}>{fmtSec(g.gapSeconds)}</td>
                    <td style={{ border: '1px solid #ddd', padding: '2px 3px', textAlign: 'center' }}>{g.prevZonSts || '—'}</td>
                    <td style={{ border: '1px solid #ddd', padding: '2px 3px', textAlign: 'center' }}>{g.currZonSts || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tmInf && tmInf.totalMinutos > 0 && (
              <p style={{ fontSize: '7px', marginTop: '4px', color: '#7c3aed' }}>
                Tiempos Muertos Informados: {tmInf.totalMinutos} min en {tmInf.registros} evento(s)
              </p>
            )}
          </div>
        </div>

        {/* Observaciones */}
        <div className="border border-slate-300 rounded-lg p-4 mb-4">
          <h2 className="text-xs font-bold mb-2">OBSERVACIONES</h2>
          <TextSection label="" id="observaciones" rows={3} />
        </div>
      </div>

      {/* ===== PAGE 2: COMMENTS & SIGNATURES ===== */}
      <div style={{ pageBreakBefore: 'always' }} className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
        <div className="border border-slate-300 rounded-lg p-4 mb-4">
          <h2 className="text-xs font-bold mb-3 border-b pb-1">COMENTARIOS</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-blue-700 mb-1 print:hidden">Comentarios del Colaborador</label>
              <span className="hidden print:block text-[10px] font-semibold text-blue-700 mb-1">Comentarios del Colaborador</span>
              <textarea id="comentColab" rows={4} className="w-full border border-blue-200 rounded p-2 text-xs print:hidden" placeholder="Espacio para que el colaborador exprese su versión..." />
              <div className="hidden print:block border border-slate-300 rounded p-2 min-h-[60px] text-xs whitespace-pre-wrap" data-print-textarea="comentColab" style={{ borderStyle: 'dashed' }}></div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-orange-700 mb-1 print:hidden">Comentarios del Coordinador</label>
              <span className="hidden print:block text-[10px] font-semibold text-orange-700 mb-1">Comentarios del Coordinador</span>
              <textarea id="comentCoord" rows={4} className="w-full border border-orange-200 rounded p-2 text-xs print:hidden" placeholder="Observaciones del coordinador a cargo..." />
              <div className="hidden print:block border border-slate-300 rounded p-2 min-h-[60px] text-xs whitespace-pre-wrap" data-print-textarea="comentCoord" style={{ borderStyle: 'dashed' }}></div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-green-700 mb-1 print:hidden">Sugerencias / Acciones Correctivas</label>
              <span className="hidden print:block text-[10px] font-semibold text-green-700 mb-1">Sugerencias / Acciones Correctivas</span>
              <textarea id="sugerencias" rows={3} className="w-full border border-green-200 rounded p-2 text-xs print:hidden" placeholder="Plan de acción propuesto..." />
              <div className="hidden print:block border border-slate-300 rounded p-2 min-h-[40px] text-xs whitespace-pre-wrap" data-print-textarea="sugerencias" style={{ borderStyle: 'dashed' }}></div>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="border border-slate-300 rounded-lg p-4">
          <h2 className="text-xs font-bold mb-3 border-b pb-1">FIRMAS</h2>
          <div className="grid grid-cols-2 gap-8 mt-8">
            <div className="text-center">
              <div className="border-b border-slate-400 mb-1 pb-8"></div>
              <p className="text-[10px] font-semibold">Firma del Colaborador</p>
              <PrintInput label="Fecha" value={new Date().toISOString().split('T')[0]} className="mt-1" />
            </div>
            <div className="text-center">
              <div className="border-b border-slate-400 mb-1 pb-8"></div>
              <p className="text-[10px] font-semibold">Firma del Coordinador</p>
              <PrintInput label="Fecha" value={new Date().toISOString().split('T')[0]} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <PrintInput label="Coordinador" value="" id="coordinador" />
            <PrintInput label="Sector" value="" id="sector" />
            <PrintInput label="RRHH" value="" id="rrhh" />
          </div>
        </div>
      </div>
    </div>
  );
}