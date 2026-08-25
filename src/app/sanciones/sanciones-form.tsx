'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2, Save } from 'lucide-react';

interface GapItem {
  fecha: string;
  prevHora: string;
  currHora: string;
  gapSeconds: number;
  prevZonSts: string | null;
  currZonSts: string | null;
  prevCodPro: string;
  currCodPro: string;
  prevBultos: number;
  currBultos: number;
}

interface TmInfData { totalMinutos: number; registros: number; }

function fmtSec(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/* ─── Print-safe input: shows <input> on screen, plain text when printing ─── */
function PrintInput({ label, value, className = '', id, bold = false }: {
  label: string; value: string; className?: string; id?: string; bold?: boolean;
}) {
  return (
    <div className={`flex items-baseline gap-1.5 ${className}`}>
      <span className={`text-[11px] shrink-0 print:text-[11px] ${bold ? 'font-bold' : 'font-semibold'}`}>
        {label}:
      </span>
      <input
        id={id}
        className="flex-1 border-b border-slate-400 bg-transparent px-1 py-0.5 text-[11px] print:hidden focus:outline-none focus:border-blue-500"
        defaultValue={value}
      />
      <span className="flex-1 hidden print:inline text-[11px] border-b border-slate-400 px-1 py-0.5 print:font-medium">
        {value || '\u00A0'}
      </span>
    </div>
  );
}

/* ─── Print-safe textarea: shows <textarea> on screen, plain text when printing ─── */
function TextSection({ label, id, rows = 4, headerColor = 'text-slate-700' }: {
  label: string; id: string; rows?: number; headerColor?: string;
}) {
  return (
    <div>
      <p className={`text-[11px] font-bold mb-1 ${headerColor}`}>{label}</p>
      <textarea
        id={id}
        rows={rows}
        className="w-full border border-slate-300 rounded-sm px-2 py-1.5 text-[10px] leading-relaxed print:hidden focus:outline-none focus:border-blue-500"
      />
      <div
        className="hidden print:block border border-slate-300 rounded-sm px-2 py-1.5 min-h-[80px] text-[10px] leading-relaxed whitespace-pre-wrap print:font-medium"
        data-print-textarea={id}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function SancionesForm() {
  const searchParams = useSearchParams();
  const codUti = searchParams.get('codUti') || '';
  const nomUti = searchParams.get('nomUti') || '';
  const turno = searchParams.get('turno') || '';
  const tiempoNetoMin = searchParams.get('tiempoNetoMin') || '0';
  const tiempoBrutoMin = searchParams.get('tiempoBrutoMin') || '0';
  const descansoMin = searchParams.get('descansoMin') || '0';
  const fechaMedicion = searchParams.get('fechaMedicion') || '';

  function minToHM(min: number): string {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [tmInf, setTmInf] = useState<TmInfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Group gaps by fecha, keeping order within each day
  const gapsByDate = React.useMemo(() => {
    const map = new Map<string, GapItem[]>();
    for (const g of gaps) {
      const list = map.get(g.fecha) || [];
      list.push(g);
      map.set(g.fecha, list);
    }
    // Sort dates descending
    const entries = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return entries.map(([fecha, items]) => {
      const totalSec = items.reduce((s, g) => s + g.gapSeconds, 0);
      const totalMin = Math.round(totalSec / 60 * 10) / 10;
      return { fecha, items, totalSec, totalMin, count: items.length };
    });
  }, [gaps]);

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
            prevCodPro: r.prevCodPro || '', currCodPro: r.currCodPro || '',
            prevBultos: r.prevBultos || 0, currBultos: r.currBultos || 0,
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

  /* ─── Collect all form data and POST to /api/sanciones ─── */
  const lastError = useRef<string>('');

  const collectAndSend = async (): Promise<boolean> => {
    const evidencia = gapsByDate.map(day =>
      `=== ${day.fecha} (${day.count} eventos - ${minToHM(day.totalMin)}) ===\n` +
      day.items.map(g =>
        `  ${g.prevHora} - ${g.currHora} | ${fmtSec(g.gapSeconds)} | ${g.prevZonSts || '?'} -> ${g.currZonSts || '?'} | ${g.prevCodPro} -> ${g.currCodPro} (Bul: ${g.prevBultos} -> ${g.currBultos})`
      ).join('\n')
    ).join('\n\n');

    const body = {
      codUti, nomUti, turno,
      tiempoNeto: Number(tiempoNetoMin),
      fechaMedicion: (document.getElementById('fechaEmision') as HTMLInputElement)?.value || fechaMedicion || new Date().toISOString().split('T')[0],
      coordinador: (document.getElementById('coordNombre') as HTMLInputElement)?.value || '',
      sectorCoordinador: (document.getElementById('coordSector') as HTMLInputElement)?.value || '',
      rrhh: (document.getElementById('rrhhNombre') as HTMLInputElement)?.value || '',
      evidencia,
      comentariosColaborador: (document.getElementById('comentColab') as HTMLTextAreaElement)?.value || '',
      comentariosCoordinador: (document.getElementById('comentCoord') as HTMLTextAreaElement)?.value || '',
      sugerencias: (document.getElementById('sugerencias') as HTMLTextAreaElement)?.value || '',
    };

    try {
      const res = await fetch('/api/sanciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        lastError.current = data.error || `HTTP ${res.status}`;
        return false;
      }
      lastError.current = '';
      return true;
    } catch (e) {
      lastError.current = e instanceof Error ? e.message : 'Error de red';
      return false;
    }
  };

  /* ─── Copy dynamic fields for print rendering ─── */
  const syncFieldsForPrint = () => {
    const container = formRef.current;
    if (!container) return;

    // Sync textareas
    container.querySelectorAll('textarea').forEach(ta => {
      const printDiv = container.querySelector(`[data-print-textarea="${ta.id}"]`);
      if (printDiv) (printDiv as HTMLElement).textContent = (ta as HTMLTextAreaElement).value;
    });

    // Sync inputs
    container.querySelectorAll('input').forEach(inp => {
      const printSpan = inp.nextElementSibling as HTMLElement | null;
      if (printSpan?.classList.contains('hidden') && printSpan.classList.contains('print:inline')) {
        printSpan.textContent = (inp as HTMLInputElement).value || '\u00A0';
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await collectAndSend();
      if (ok) {
        alert('Sancion registrada correctamente');
      } else {
        alert('Error al guardar: ' + lastError.current);
      }
    } catch (e) {
      console.error('Error saving:', e);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      syncFieldsForPrint();
      const saved = await collectAndSend();
      if (!saved) {
        alert('Error al guardar: ' + lastError.current + '\nNo se procedera con la impresion.');
        setPrinting(false);
        return;
      }
      window.print();
    } catch (e) {
      console.error('Error printing:', e);
      alert('Error al guardar/imprimir la sancion.');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-white print:bg-white" ref={formRef}>
      {/* ─── SCREEN-ONLY TOOLBAR ─── */}
      <div className="print:hidden flex items-center gap-3 px-4 py-2.5 border-b bg-white sticky top-0 z-10 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <h1 className="text-sm font-bold text-slate-700">Pedido de Explicacion - Preparacion</h1>
        <div className="flex-1" />
        <Button
          variant="outline" size="sm" onClick={handleSave} disabled={saving}
          className="gap-1 text-xs border-green-400 text-green-700 hover:bg-green-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Guardar
        </Button>
        <Button
          size="sm" onClick={handlePrint} disabled={printing}
          className="bg-red-600 text-white hover:bg-red-700 gap-1 text-xs"
        >
          {printing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
          Imprimir y Registrar
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PRINT LAYOUT — mirrors the DOCX template structure                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <div className="max-w-[210mm] mx-auto print:max-w-none print:mx-0 print:p-0 px-6 py-4 print:px-0 print:py-0">

        {/* ─── HEADER IMAGE ─── */}
        <div className="print:m-[12mm_15mm_0_15mm] mb-2 print:mb-0">
          <img
            src="/header-bg.png"
            alt=""
            className="w-full h-auto object-contain print:object-cover"
            style={{ maxWidth: '100%' }}
          />
        </div>

        {/* ─── TITLE ─── */}
        <div className="text-center mt-2 mb-4 print:mt-3 print:mb-4 print:mx-[15mm]">
          <h1 className="text-sm font-bold tracking-wider print:text-[14pt] uppercase">
            Pedido de Explicacion Preparacion STD
          </h1>
        </div>

        {/* ─── TWO-COLUMN DATA TABLE ─── */}
        <div className="print:mx-[15mm] mb-4">
          <table className="w-full border-collapse text-[11px] print:text-[11pt]">
            <thead>
              <tr className="border-b-2 border-slate-800">
                <th className="text-left py-1 px-2 font-bold text-[11px] print:text-[11pt] border-r border-slate-800 w-1/2">
                  Datos del Colaborador
                </th>
                <th className="text-left py-1 px-2 font-bold text-[11px] print:text-[11pt] w-1/2">
                  Datos de Coordinadores
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1: Apellido y Nombre */}
              <tr className="border-b border-slate-300">
                <td className="py-1 px-2 border-r border-slate-300">
                  <PrintInput label="Apellido y Nombre" value={nomUti} />
                </td>
                <td className="py-1 px-2">
                  <PrintInput label="Apellido y Nombre" value="" id="coordNombre" />
                </td>
              </tr>
              {/* Row 2: Legajo / Sector */}
              <tr className="border-b border-slate-300">
                <td className="py-1 px-2 border-r border-slate-300">
                  <PrintInput label="Legajo" value={codUti} />
                </td>
                <td className="py-1 px-2">
                  <PrintInput label="Sector" value="" id="coordSector" />
                </td>
              </tr>
              {/* Row 3: Sector (fixed) / Interviene por RR.HH. */}
              <tr className="border-b border-slate-300">
                <td className="py-1 px-2 border-r border-slate-300">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold shrink-0">Sector:</span>
                    <span className="text-[11px] font-bold print:text-[11pt]">PREPARACION</span>
                  </div>
                </td>
                <td className="py-1 px-2">
                  <span className="text-[11px] font-semibold">Interviene por RR.HH.</span>
                </td>
              </tr>
              {/* Row 4: Funcion (fixed) / RR.HH. Nombre */}
              <tr className="border-b border-slate-300">
                <td className="py-1 px-2 border-r border-slate-300">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold shrink-0">Funcion:</span>
                    <span className="text-[11px] font-bold print:text-[11pt]">PREPARADOR</span>
                  </div>
                </td>
                <td className="py-1 px-2">
                  <PrintInput label="Apellido y Nombre" value="" id="rrhhNombre" />
                </td>
              </tr>
              {/* Row 5: Turno */}
              <tr className="border-b border-slate-300">
                <td className="py-1 px-2 border-r border-slate-300">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold shrink-0">Turno:</span>
                    <span className="text-[11px] font-bold print:text-[11pt]">{turno}</span>
                  </div>
                </td>
                <td className="py-1 px-2"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── DATE ROW ─── */}
        <div className="print:mx-[15mm] mb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold shrink-0">Fecha</span>
            <span className="text-[9px] text-slate-400 print:hidden">(colocar la fecha en que se emite el documento)</span>
            <input
              id="fechaEmision"
              type="date"
              className="flex-1 border-b border-slate-400 bg-transparent px-1 py-0.5 text-[11px] print:hidden focus:outline-none focus:border-blue-500"
              defaultValue={fechaMedicion || today}
            />
            <span className="flex-1 hidden print:inline text-[11px] border-b border-slate-400 px-1 py-0.5 font-medium">
              {fechaMedicion || today}
            </span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION: EVIDENCIA DEL CASO                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="print:mx-[15mm] mb-4">
          <div className="border border-slate-400 rounded-sm">
            {/* Section header */}
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-400 flex items-center justify-between">
              <span className="text-[11px] font-bold print:text-[12pt]">Evidencia del Caso</span>
            </div>

            {/* Incidencia - single row */}
            <div className="px-3 py-1.5 border-b border-slate-300">
              <p className="text-[11px] font-bold print:text-[11pt]">Incidencia Proceso Operaciones</p>
              <p className="text-[10px]" style={{ color: '#555' }}>Tiempo ocioso dentro de la jornada</p>
            </div>

            {/* Summary stats: Bruto / Descanso / TM Informado / Neto */}
            <div className="px-3 py-2 border-b border-slate-300 bg-slate-50/50">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide">Tiempo Bruto</p>
                  <p className="text-base font-bold text-red-600 print:text-[14pt]">
                    {minToHM(Number(tiempoBrutoMin))}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide">Descanso</p>
                  <p className="text-base font-bold text-slate-600 print:text-[14pt]">
                    {Number(descansoMin) > 0 ? minToHM(Number(descansoMin)) : '0'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-purple-500 uppercase tracking-wide">TM Informado</p>
                  <p className="text-base font-bold text-purple-700 print:text-[14pt]">
                    {tmInf && tmInf.totalMinutos > 0 ? `${tmInf.totalMinutos} min` : '0 min'}
                  </p>
                  <p className="text-[9px] text-purple-400">
                    {tmInf && tmInf.registros > 0 ? `${tmInf.registros} eventos` : '0 eventos'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-blue-500 uppercase tracking-wide">Tiempo Neto</p>
                  <p className="text-base font-bold text-blue-700 print:text-[14pt]">
                    {minToHM(Number(tiempoNetoMin))}
                  </p>
                </div>
              </div>
            </div>

            {/* Gaps detail - Screen view (grouped by date) */}
            <div className="p-3 print:hidden">
              {gaps.length > 0 ? (
                gapsByDate.map(day => (
                  <div key={day.fecha} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{day.fecha}</span>
                      <span className="text-[9px] text-muted-foreground">{day.count} evento(s)</span>
                      <span className="text-[9px] font-bold text-red-600">{minToHM(day.totalMin)}</span>
                    </div>
                    <textarea
                      className="w-full border border-slate-300 rounded-sm p-2 text-[10px] font-mono leading-relaxed bg-white"
                      rows={Math.min(day.items.length + 2, 12)}
                      readOnly
                      value={
                        '#  Hora Inicio | Hora Fin   | Duracion  | Bul.Ant | Bul.Pos | Zona O. -> Zona D. | Producto\n' +
                        '---|-------------|------------|-----------|---------|---------|--------------------|----------\n' +
                        day.items.map((g, i) =>
                          `${String(i + 1).padStart(2)}  ${g.prevHora}    | ${g.currHora}    | ${fmtSec(g.gapSeconds).padEnd(9)} | ${String(g.prevBultos).padEnd(6)} | ${String(g.currBultos).padEnd(6)} | ${(g.prevZonSts || '?').padEnd(8)} -> ${(g.currZonSts || '?').padEnd(8)} | ${g.prevCodPro}`
                        ).join('\n')
                      }
                    />
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-slate-400 italic">Sin eventos de tiempo muerto registrados para este operador.</p>
              )}
            </div>

            {/* Gaps detail - Print view (grouped by date) */}
            <div className="hidden print:block p-3">
              {gapsByDate.map(day => (
                <div key={day.fecha} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', borderBottom: '1px solid #666', paddingBottom: '2px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 'bold', background: '#f1f5f9', padding: '1px 6px', borderRadius: '2px' }}>{day.fecha}</span>
                    <span style={{ fontSize: '8px', color: '#666' }}>{day.count} evento(s)</span>
                    <span style={{ fontSize: '8px', fontWeight: 'bold', color: '#dc2626' }}>{minToHM(day.totalMin)}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #999' }}>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center', width: '18px' }}>#</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Inicio</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Fin</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Duracion</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Bul.Ant</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Bul.Pos</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Zona O.</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'center' }}>Zona D.</th>
                        <th style={{ border: '1px solid #999', padding: '1px 3px', textAlign: 'left' }}>Producto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.items.map((g, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center' }}>{g.prevHora}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center' }}>{g.currHora}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center', fontWeight: 'bold' }}>{fmtSec(g.gapSeconds)}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center' }}>{g.prevBultos}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center' }}>{g.currBultos}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center' }}>{g.prevZonSts || '-'}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px', textAlign: 'center' }}>{g.currZonSts || '-'}</td>
                          <td style={{ border: '1px solid #ddd', padding: '1px 2px' }}>{g.prevCodPro}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {tmInf && tmInf.totalMinutos > 0 && (
                <p style={{ fontSize: '8px', marginTop: '4px', color: '#7c3aed' }}>
                  Tiempos Muertos Informados: {tmInf.totalMinutos} min en {tmInf.registros} evento(s)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PAGE 2 (print break) — COMMENTS & SIGNATURES                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ pageBreakBefore: 'always' }} className="print:mx-[15mm] print:mt-[12mm]">
          {/* Re-show header on page 2 when printing */}
          <div className="hidden print:block print:mb-3">
            <img
              src="/header-bg.png"
              alt=""
              className="w-full h-auto object-contain"
            />
          </div>

          {/* Comentarios del Colaborador */}
          <div className="mb-5">
            <TextSection label="Comentarios del Colaborador" id="comentColab" rows={5} headerColor="text-slate-800" />
          </div>

          {/* Comentarios del Coordinador */}
          <div className="mb-5">
            <TextSection label="Comentarios del Coordinador" id="comentCoord" rows={5} headerColor="text-slate-800" />
          </div>

          {/* Sugerencias/Mejora/Compromiso */}
          <div className="mb-6">
            <TextSection label="Sugerencias / Mejora / Compromiso" id="sugerencias" rows={4} headerColor="text-slate-800" />
          </div>

          {/* ─── SIGNATURES ─── */}
          <div className="mt-10">
            <table className="w-full border-collapse text-[11px] print:text-[11pt]">
              <tbody>
                <tr>
                  <td className="text-center py-8 w-1/3">
                    <div className="border-b border-slate-800 mb-1 mx-4" style={{ height: '60px' }}></div>
                    <p className="text-[11px] font-bold">Firma de Colaborador</p>
                  </td>
                  <td className="text-center py-8 w-1/3">
                    <div className="border-b border-slate-800 mb-1 mx-4" style={{ height: '60px' }}></div>
                    <p className="text-[11px] font-bold">Firma del Coordinador</p>
                  </td>
                  <td className="text-center py-8 w-1/3">
                    <div className="border-b border-slate-800 mb-1 mx-4" style={{ height: '60px' }}></div>
                    <p className="text-[11px] font-bold">Firma de RR.HH.</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── FOOTER IMAGE ─── */}
        <div className="print:m-[0_15mm_12mm_15mm] mt-4 print:mt-0">
          <img
            src="/footer-bg.png"
            alt=""
            className="w-full h-auto object-contain"
            style={{ maxWidth: '100%' }}
          />
        </div>

      </div>
    </div>
  );
}