'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Upload, RefreshCw, Clock, BarChart3, AlertTriangle,
  Loader2, Database, Timer, ChevronLeft, ChevronRight,
  X, ArrowDown, Trophy, ArrowRight, User, Sun, Sunset, Moon,
  PlayCircle, StopCircle, Download, FileSpreadsheet, Shield,
  Trash2, Package,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// --- Types ---
interface KPIs {
  totalScans: number;
  totalDeadTime: number;
  deadTimeEvents: number;
  avgGap: number;
  maxGap: number;
  totalDescansoMin: number;
  totalTmInfMin: number;
  totalTmInfEventos: number;
  totalNetoMin: number;
  totalBultos: number;
  totalPreparacionMin: number;
  totalColaboradores: number;
}

interface ShiftData {
  TM: { sec: number; events: number };
  TT: { sec: number; events: number };
  TN: { sec: number; events: number };
}

interface OpStat {
  codUti: string;
  nomUti: string;
  totalMin: number;
  totalMinSec: number;
  tmInfMin: number;
  tmInfEventos: number;
  descansoMin: number;
  descansoMinSec: number;
  totalNetoMin: number;
  totalNetoMinSec: number;
  totalBultos: number;
  diasTrabajados: number;
  events: number;
  maxGap: number;
  turno: string;
}

interface GapRow {
  rank: number;
  codUti: string;
  nomUti: string;
  fecha: string;
  gapSeconds: number;
  turno: string;
  prevHora: string;
  prevZonSts: string | null;
  prevCodAct: number;
  prevCodPro: string;
  prevBultos: number;
  currHora: string;
  currZonSts: string | null;
  currCodAct: number;
  currCodPro: string;
  currBultos: number;
}

interface PickRow {
  codUti: string;
  nomUti: string;
  fecha: string;
  turno: string;
  totalScans: number;
  primerHora: string;
  primerZona: string | null;
  primerProducto: string;
  ultimoHora: string;
  ultimoZona: string | null;
  ultimoProducto: string;
  jornadaSec: number;
  descansoSec: number;
  jornadaEfectivaSec: number;
}

interface Filters {
  operators: { codUti: string; nomUti: string }[];
  dates: string[];
  totalRecords: number;
}

function fmtDur(s: number): string {
  if (s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function TurnoBadge({ turno }: { turno: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    TM: { bg: 'bg-amber-100', text: 'text-amber-800', icon: <Sun className="h-3 w-3" />, label: 'TM' },
    TT: { bg: 'bg-orange-100', text: 'text-orange-800', icon: <Sunset className="h-3 w-3" />, label: 'TT' },
    TN: { bg: 'bg-indigo-100', text: 'text-indigo-800', icon: <Moon className="h-3 w-3" />, label: 'TN' },
  };
  const c = config[turno] || config.TM;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${c.bg} ${c.text}`}>
      {c.icon} {c.label}
    </span>
  );
}

type TabType = 'ranking' | 'operador' | 'prep-std' | 'prep-xd' | 'picks' | 'sanciones';
type SancionTurnoFilter = 'todos' | 'TM' | 'TT' | 'TN';

// --- Main Page ---
export default function DashboardPage() {
  const [stats, setStats] = useState<{ kpis: KPIs; byShift: ShiftData; byOperator: OpStat[] } | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [gapSummary, setGapSummary] = useState<{ totalDeadTimeSec: number; totalDeadTimeFormatted: string; deadTimeCount: number } | null>(null);
  const [gapPage, setGapPage] = useState(1);
  const [gapTotalPages, setGapTotalPages] = useState(1);
  const [gapTotal, setGapTotal] = useState(0);
  // Picks state
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [picksPage, setPicksPage] = useState(1);
  const [picksTotalPages, setPicksTotalPages] = useState(1);
  const [picksTotal, setPicksTotal] = useState(0);
  const [picksLoading, setPicksLoading] = useState(false);

  // === STD State ===
  const [stdStats, setStdStats] = useState<{ kpis: KPIs; byOperator: OpStat[] } | null>(null);
  const [stdGaps, setStdGaps] = useState<GapRow[]>([]);
  const [stdGapPage, setStdGapPage] = useState(1);
  const [stdGapTotalPages, setStdGapTotalPages] = useState(1);
  const [stdGapTotal, setStdGapTotal] = useState(0);
  const [stdGapLoading, setStdGapLoading] = useState(false);
  const [stdSelectedOp, setStdSelectedOp] = useState<string>('all');

  // === XD State ===
  const [xdStats, setXdStats] = useState<{ kpis: KPIs; byOperator: OpStat[] } | null>(null);
  const [xdGaps, setXdGaps] = useState<GapRow[]>([]);
  const [xdGapPage, setXdGapPage] = useState(1);
  const [xdGapTotalPages, setXdGapTotalPages] = useState(1);
  const [xdGapTotal, setXdGapTotal] = useState(0);
  const [xdGapLoading, setXdGapLoading] = useState(false);
  const [xdSelectedOp, setXdSelectedOp] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [gapLoading, setGapLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<string>('all');
  const [selectedTurno, setSelectedTurno] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [hasData, setHasData] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('ranking');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tmInfInputRef = useRef<HTMLInputElement>(null);
  const [tmInfUploading, setTmInfUploading] = useState(false);
  const [sancionCount, setSancionCount] = useState(0);
  const [sanciones, setSanciones] = useState<any[]>([]);
  const [sancionesCounts, setSancionesCounts] = useState<Record<string, { count: number; lastDate: string }>>({});
  const [sancionesLoading, setSancionesLoading] = useState(false);
  const [sancionTurnoFilter, setSancionTurnoFilter] = useState<SancionTurnoFilter>('todos');
  const [opSearch, setOpSearch] = useState('');
  const [opDropdownOpen, setOpDropdownOpen] = useState(false);
  const { toast } = useToast();

  const fetchFilters = useCallback(async () => {
    try {
      const res = await fetch('/api/records');
      if (!res.ok) throw new Error();
      const data: Filters = await res.json();
      setFilters(data);
      setHasData(data.totalRecords > 0);
    } catch { /* silent */ }
  }, []);

  const addCommonParams = (params: URLSearchParams) => {
    if (selectedOp !== 'all') params.set('operator', selectedOp);
    if (selectedTurno !== 'all') params.set('turno', selectedTurno);
    if (selectedDate !== 'all') params.set('fecha', selectedDate);
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      addCommonParams(params);
      const res = await fetch(`/api/stats?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStats(data);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar las estadísticas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOp, selectedTurno, selectedDate, toast]);

  const fetchGaps = useCallback(async (page: number) => {
    setGapLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '50');
      addCommonParams(params);
      const res = await fetch(`/api/movements?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGaps(data.rows);
      setGapSummary(data.summary);
      setGapPage(data.pagination.page);
      setGapTotalPages(data.pagination.totalPages);
      setGapTotal(data.pagination.total);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los gaps', variant: 'destructive' });
    } finally {
      setGapLoading(false);
    }
  }, [selectedOp, selectedTurno, selectedDate, toast]);

  const fetchPicks = useCallback(async (page: number) => {
    setPicksLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '100');
      addCommonParams(params);
      const res = await fetch(`/api/picks?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPicks(data.rows);
      setPicksPage(data.pagination.page);
      setPicksTotalPages(data.pagination.totalPages);
      setPicksTotal(data.pagination.total);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los picks', variant: 'destructive' });
    } finally {
      setPicksLoading(false);
    }
  }, [selectedOp, selectedTurno, selectedDate, toast]);

  const fetchZonaStats = useCallback(async (zona: 'std' | 'xd', setter: (data: any) => void) => {
    try {
      const params = new URLSearchParams();
      params.set('zona', zona);
      if (selectedTurno !== 'all') params.set('turno', selectedTurno);
      if (selectedDate !== 'all') params.set('fecha', selectedDate);
      const res = await fetch(`/api/stats?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setter(data);
    } catch { /* silent */ }
  }, [selectedTurno, selectedDate]);

  const fetchZonaGaps = useCallback(async (zona: 'std' | 'xd', operator: string, page: number, setter: (data: any) => void, setPage: (p: number) => void, setTotalPages: (p: number) => void, setTotal: (t: number) => void, setLoading: (l: boolean) => void) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('zona', zona);
      params.set('page', String(page));
      params.set('pageSize', '50');
      params.set('operator', operator);
      if (selectedTurno !== 'all') params.set('turno', selectedTurno);
      if (selectedDate !== 'all') params.set('fecha', selectedDate);
      const res = await fetch(`/api/movements?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setter(data.rows);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los gaps', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedTurno, selectedDate, toast]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  const fetchSanciones = useCallback(async () => {
    setSancionesLoading(true);
    try {
      const res = await fetch('/api/sanciones');
      const data = await res.json();
      setSanciones(data.sanciones || []);
      setSancionesCounts(data.countsByOp || {});
      if (selectedOp !== 'all' && data.countsByOp) {
        setSancionCount(data.countsByOp[selectedOp]?.count || 0);
      } else {
        setSancionCount(data.total || 0);
      }
    } catch { /* silent */ }
    finally { setSancionesLoading(false); }
  }, [selectedOp]);

  const handleDeleteSancion = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Eliminar esta sancion?')) return;
    try {
      const res = await fetch(`/api/sanciones?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Sancion eliminada' });
        fetchSanciones();
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (hasData) { fetchStats(); fetchGaps(1); fetchPicks(1); }
    else { setLoading(false); }
  }, [fetchStats, hasData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasData) return;
    fetchStats();
    if (activeTab === 'operador' && selectedOp !== 'all') fetchGaps(1);
    if (activeTab === 'prep-std') {
      fetchZonaStats('std', setStdStats);
      if (stdSelectedOp !== 'all') fetchZonaGaps('std', stdSelectedOp, stdGapPage, setStdGaps, setStdGapPage, setStdGapTotalPages, setStdGapTotal, setStdGapLoading);
    }
    if (activeTab === 'prep-xd') {
      fetchZonaStats('xd', setXdStats);
      if (xdSelectedOp !== 'all') fetchZonaGaps('xd', xdSelectedOp, xdGapPage, setXdGaps, setXdGapPage, setXdGapTotalPages, setXdGapTotal, setXdGapLoading);
    }
    if (activeTab === 'picks') fetchPicks(1);
    if (activeTab === 'sanciones') fetchSanciones();
  }, [selectedOp, selectedTurno, selectedDate, activeTab, hasData, stdSelectedOp, stdGapPage, xdSelectedOp, xdGapPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close operator dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (opDropdownOpen && !target.closest('[data-op-search-container]')) {
        setOpDropdownOpen(false);
      }
    };
    if (opDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [opDropdownOpen]);

  const handleOpChange = (val: string) => {
    setSelectedOp(val);
    setGapPage(1);
    setPicksPage(1);
    if (val !== 'all') setActiveTab('operador');
  };

  const handleTurnoChange = (val: string) => {
    setSelectedTurno(val);
    setGapPage(1);
    setPicksPage(1);
  };

  const handleDateChange = (val: string) => {
    setSelectedDate(val);
    setGapPage(1);
    setPicksPage(1);
  };

  const handleOperatorClick = (codUti: string) => {
    setSelectedOp(codUti);
    setGapPage(1);
    setActiveTab('operador');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Parse xlsx in browser to avoid Vercel payload size limits
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      if (!rawRows || rawRows.length === 0) {
        throw new Error('El archivo está vacío');
      }

      // Validate columns
      const required = ['CODUTI', 'NOMUTI', 'FECHA', 'HORA', 'CODACT', 'ZONSTS', 'ALLSTS', 'DPLSTS', 'NIVSTS', 'CODPRO', 'PCBPRO', 'BULTOS'];
      const missing = required.filter(col => !(col in rawRows[0]));
      if (missing.length > 0) throw new Error(`Faltan columnas: ${missing.join(', ')}`);

      // Parse all rows on client
      const parsedRows = rawRows.map(row => {
        let fechaStr = '';
        const rawFecha = row['FECHA'];
        if (rawFecha instanceof Date) fechaStr = rawFecha.toISOString();
        else if (typeof rawFecha === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          fechaStr = new Date(excelEpoch.getTime() + rawFecha * 86400000).toISOString();
        } else if (typeof rawFecha === 'string') fechaStr = new Date(rawFecha).toISOString();

        let hora = '';
        const rawHora = row['HORA'];
        if (typeof rawHora === 'number') {
          const totalSeconds = Math.floor(rawHora * 86400);
          const h = Math.floor(totalSeconds / 3600);
          const m = Math.floor((totalSeconds % 3600) / 60);
          const s = totalSeconds % 60;
          hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } else if (typeof rawHora === 'string') hora = rawHora;
        else if (rawHora instanceof Date) hora = rawHora.toTimeString().slice(0, 8);

        return {
          codUti: String(row['CODUTI'] || ''),
          nomUti: String(row['NOMUTI'] || ''),
          fecha: fechaStr,
          hora,
          codAct: Number(row['CODACT']) || 0,
          zonSts: row['ZONSTS'] ? String(row['ZONSTS']) : null,
          allSts: Number(row['ALLSTS']) || 0,
          dplSts: Number(row['DPLSTS']) || 0,
          nivSts: Number(row['NIVSTS']) || 0,
          codPro: String(row['CODPRO'] || ''),
          pcbPro: Number(row['PCBPRO']) || 0,
          bultos: Number(row['BULTOS']) || 0,
        };
      });

      // Send in batches to avoid Vercel payload limits
      const BATCH_SIZE = 2000;
      let totalInserted = 0;
      for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
        const batch = parsedRows.slice(i, i + BATCH_SIZE);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: batch,
            clearFirst: i === 0,
            totalExpected: parsedRows.length,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Error HTTP ${res.status}`);
        }
        const data = await res.json();
        totalInserted += data.inserted || 0;
      }

      toast({ title: 'Datos actualizados', description: `${totalInserted} registros cargados` });
      setHasData(true);
      setSelectedOp('all');
      setSelectedTurno('all');
      setSelectedDate('all');
      setActiveTab('ranking');
      await fetchFilters();
    } catch (err) {
      toast({ title: 'Error al cargar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTmInfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTmInfUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/tm-informados', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: 'TM Informados cargados', description: `${data.totalRecords} registros de tiempos muertos informados` });
      await fetchStats();
    } catch (err) {
      toast({ title: 'Error al cargar TM Informados', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setTmInfUploading(false);
      if (tmInfInputRef.current) tmInfInputRef.current.value = '';
    }
  };

  const selectedOpName = selectedOp !== 'all'
    ? (stats?.byOperator.find(o => o.codUti === selectedOp)?.nomUti ?? filters?.operators.find(o => o.codUti === selectedOp)?.nomUti ?? selectedOp)
    : null;
  const selectedOpStats = selectedOp !== 'all'
    ? stats?.byOperator.find(o => o.codUti === selectedOp)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500">
              <Timer className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">Tiempos Muertos Operativos</h1>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
            <input ref={tmInfInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleTmInfUpload} />
            <Button variant="outline" size="sm" onClick={() => tmInfInputRef.current?.click()} disabled={tmInfUploading} title="Cargar Tiempos Muertos Informados">
              {tmInfUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1">TM Inf.</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1">{uploading ? 'Cargando...' : 'Cargar Excel'}</span>
            </Button>
            <Button size="sm" onClick={() => { fetchStats(); fetchGaps(gapPage); fetchPicks(picksPage); }} disabled={loading || gapLoading || picksLoading}
              className="bg-red-500 text-white hover:bg-red-600">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline ml-1">Actualizar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 space-y-4">
        {!hasData ? (
          <Card className="mt-10">
            <CardContent className="flex flex-col items-center py-16">
              <Database className="h-14 w-14 text-muted-foreground/30 mb-4" />
              <h2 className="text-lg font-semibold mb-2">Sin datos cargados</h2>
              <p className="text-sm text-muted-foreground mb-6">Carga un archivo Excel para comenzar.</p>
              <Button onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Cargar archivo</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Operador:</span>
              <div className="relative w-full sm:w-[260px]" data-op-search-container>
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="Buscar por nombre o legajo..."
                    className="h-8 text-xs"
                    value={opSearch}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOpSearch(v);
                      if (v.trim() === '' && selectedOp !== 'all') {
                        setSelectedOp('all');
                        handleOpChange('all');
                      }
                      setOpDropdownOpen(true);
                    }}
                    onFocus={() => setOpDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setOpDropdownOpen(false);
                      }
                    }}
                  />
                  {selectedOp !== 'all' && (
                    <button
                      className="flex-shrink-0 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      onClick={() => {
                        setSelectedOp('all');
                        setOpSearch('');
                        handleOpChange('all');
                      }}
                      title="Limpiar selección"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {opDropdownOpen && opSearch.trim() !== '' && filters?.operators && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border rounded-md shadow-lg">
                    {filters.operators
                      .filter(o => o.codUti.trim())
                      .filter(o => {
                        const q = opSearch.toLowerCase().trim();
                        return o.nomUti.toLowerCase().includes(q) || o.codUti.toLowerCase().includes(q);
                      })
                      .slice(0, 20)
                      .map(o => (
                        <button
                          key={o.codUti}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between ${selectedOp === o.codUti ? 'bg-red-50 text-red-700 font-medium' : ''}`}
                          onClick={() => {
                            setSelectedOp(o.codUti);
                            setOpSearch(o.nomUti);
                            setOpDropdownOpen(false);
                            handleOpChange(o.codUti);
                          }}
                        >
                          <span>{o.nomUti}</span>
                          <span className="text-[10px] text-muted-foreground font-mono ml-2">{o.codUti}</span>
                        </button>
                      ))}
                    {filters.operators.filter(o => o.codUti.trim()).filter(o => {
                      const q = opSearch.toLowerCase().trim();
                      return o.nomUti.toLowerCase().includes(q) || o.codUti.toLowerCase().includes(q);
                    }).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>
                    )}
                  </div>
                )}
              </div>

              <span className="text-xs font-medium text-muted-foreground ml-2">Turno:</span>
              <Select value={selectedTurno} onValueChange={handleTurnoChange}>
                <SelectTrigger className="w-full sm:w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="TM">TM (Mañana)</SelectItem>
                  <SelectItem value="TT">TT (Tarde)</SelectItem>
                  <SelectItem value="TN">TN (Noche)</SelectItem>
                </SelectContent>
              </Select>

              <span className="text-xs font-medium text-muted-foreground ml-2">Fecha:</span>
              <Select value={selectedDate} onValueChange={handleDateChange}>
                <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fechas</SelectItem>
                  {filters?.dates.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(selectedOp !== 'all' || selectedTurno !== 'all' || selectedDate !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setSelectedOp('all'); setSelectedTurno('all'); setSelectedDate('all'); setActiveTab('ranking'); }} className="h-8 text-xs">
                  <X className="h-3 w-3 mr-1" />Limpiar
                </Button>
              )}
            </div>

            {/* KPIs */}
            {stats && !loading && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg bg-blue-500 p-2"><BarChart3 className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Total Escaneos</p>
                      <p className="text-lg sm:text-2xl font-bold">{stats.kpis.totalScans.toLocaleString('es-AR')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50/60">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg bg-red-500 p-2"><Clock className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-red-600 font-medium">Suma Tiempos Muertos</p>
                      <p className="text-lg sm:text-2xl font-bold text-red-700">{fmtDur(stats.kpis.totalDeadTime)}</p>
                      <p className="text-[10px] text-red-500">{stats.kpis.deadTimeEvents} eventos (&gt;5 min)</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg bg-amber-500 p-2"><AlertTriangle className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Promedio Gap (&gt;5 min)</p>
                      <p className="text-lg sm:text-2xl font-bold">{fmtDur(stats.kpis.avgGap)}</p>
                      <p className="text-[10px] text-muted-foreground">solo tiempos muertos</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg bg-orange-500 p-2"><AlertTriangle className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Mayor sin Actividad</p>
                      <p className="text-lg sm:text-2xl font-bold">{fmtDur(stats.kpis.maxGap)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Summary + Shift breakdown */}
            {stats && !loading && selectedOp === 'all' && selectedTurno === 'all' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowDown className="h-4 w-4 text-red-500" />
                      <h3 className="text-sm font-semibold text-red-700">Resumen (&gt;5 min)</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Eventos</span>
                        <span className="font-bold text-red-600 text-base">{stats.kpis.deadTimeEvents}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Suma total</span>
                        <span className="font-bold text-red-600 text-base">{fmtDur(stats.kpis.totalDeadTime)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold mb-3">Por Turno</h3>
                    <p className="text-[10px] text-muted-foreground mb-3">
                      TM (6-14hs) · TT (14-22hs) · TN (resto)
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {(['TM', 'TT', 'TN'] as const).map(t => (
                        <div key={t} className={`rounded-lg p-3 border ${t === 'TM' ? 'bg-amber-50 border-amber-200' : t === 'TT' ? 'bg-orange-50 border-orange-200' : 'bg-indigo-50 border-indigo-200'}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <TurnoBadge turno={t} />
                          </div>
                          <p className={`text-lg font-bold ${t === 'TM' ? 'text-amber-900' : t === 'TT' ? 'text-orange-900' : 'text-indigo-900'}`}>
                            {fmtDur(stats.byShift[t].sec)}
                          </p>
                          <p className={`text-[10px] ${t === 'TM' ? 'text-amber-600' : t === 'TT' ? 'text-orange-600' : 'text-indigo-600'}`}>
                            {stats.byShift[t].events} eventos · {Math.round(stats.byShift[t].sec / 60)} min
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Operator detail summary */}
            {selectedOp !== 'all' && selectedOpStats && gapSummary && (
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-red-500" />
                    <h3 className="text-sm font-semibold text-red-700">{selectedOpName}</h3>
                    <TurnoBadge turno={selectedOpStats.turno} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set('codUti', selectedOp);
                        params.set('nomUti', selectedOpName || '');
                        params.set('turno', selectedOpStats.turno);
                        params.set('tiempoNetoMin', String(selectedOpStats.totalNetoMin));
                        params.set('tiempoBrutoMin', String(selectedOpStats.totalMin));
                        params.set('descansoMin', String(selectedOpStats.descansoMin));
                        window.open(`/sanciones?${params}`, '_blank');
                      }}
                    >
                      <Shield className="h-3 w-3" />
                      Sanción Tiempo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-blue-300 text-blue-600 hover:bg-blue-50"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set('codUti', selectedOp);
                        params.set('nomUti', selectedOpName || '');
                        params.set('turno', selectedOpStats.turno);
                        window.open(`/sanciones-inicio?${params}`, '_blank');
                      }}
                    >
                      <PlayCircle className="h-3 w-3" />
                      Sanción Inicio
                    </Button>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-slate-200">
                      <span className="text-[10px] text-muted-foreground">Bultos</span>
                      <span className="text-xs text-right font-bold text-slate-800">{(selectedOpStats.totalBultos || 0).toLocaleString('es-AR')}</span>
                      <span className="text-[10px] text-right text-muted-foreground">{selectedOpStats.diasTrabajados} días</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-red-100">
                      <span className="text-[10px] text-muted-foreground">Tiempo Muerto</span>
                      <span className="text-xs text-right font-bold text-red-600">{fmtDur(selectedOpStats.totalMinSec)}</span>
                      <span className="text-[10px] text-right text-muted-foreground">{selectedOpStats.totalMin} min</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-purple-100">
                      <span className="text-[10px] text-muted-foreground">TM Informados</span>
                      <span className="text-xs text-right font-bold text-purple-700">{selectedOpStats.tmInfMin > 0 ? `-${selectedOpStats.tmInfMin} min` : '—'}</span>
                      <span className="text-[10px] text-right text-purple-500">{selectedOpStats.tmInfEventos > 0 ? `${selectedOpStats.tmInfEventos} eventos` : '—'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-center py-1 border-b border-slate-200">
                      <span className="text-[10px] text-muted-foreground">Descanso</span>
                      <span className="text-xs text-right font-medium text-slate-500">{selectedOpStats.descansoMin > 0 ? `-${fmtDur(selectedOpStats.descansoMinSec)}` : '—'}</span>
                      <span className="text-[10px] text-right text-muted-foreground">{selectedOpStats.descansoMin > 0 ? `-${selectedOpStats.descansoMin} min (${selectedOpStats.diasTrabajados}d x 35m)` : selectedOpStats.turno === 'TN' ? 'no aplica (TN)' : '—'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-center py-1.5 bg-green-50/60 rounded px-1">
                      <span className="text-[10px] font-semibold text-green-700">Tiempo Neto</span>
                      <span className="text-xs text-right font-bold text-green-700">{fmtDur(selectedOpStats.totalNetoMinSec)}</span>
                      <span className="text-[10px] text-right text-green-600">{selectedOpStats.totalNetoMin} min</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-center pt-1 border-t border-slate-200">
                      <span className="text-[10px] text-muted-foreground">Eventos / Mayor gap</span>
                      <span className="text-xs text-right font-bold">{gapSummary.deadTimeCount} eventos</span>
                      <span className="text-xs text-right font-mono text-red-700">{fmtDur(selectedOpStats.maxGap)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs */}
            {stats && !loading && (
              <div className="flex gap-1 border-b">
                <button
                  onClick={() => setActiveTab('ranking')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'ranking' ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Trophy className="h-3 w-3 inline mr-1" />
                  Ranking
                </button>
                <button
                  onClick={() => setActiveTab('operador')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'operador' ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="h-3 w-3 inline mr-1" />
                  Por Operador
                  {selectedOp !== 'all' && (
                    <span className="ml-1.5 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                      {selectedOpName}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('prep-std')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'prep-std' ? 'border-blue-500 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Package className="h-3 w-3 inline mr-1" />
                  Prep. STD
                </button>
                <button
                  onClick={() => setActiveTab('prep-xd')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'prep-xd' ? 'border-purple-500 text-purple-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Package className="h-3 w-3 inline mr-1" />
                  Prep. XD
                </button>
                <button
                  onClick={() => setActiveTab('picks')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'picks' ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <PlayCircle className="h-3 w-3 inline mr-1" />
                  Picks
                </button>
                <button
                  onClick={() => setActiveTab('sanciones')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors relative ${
                    activeTab === 'sanciones' ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Shield className="h-3 w-3 inline mr-1" />
                  Sanciones
                  {sancionCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                      {sancionCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* ===================== RANKING TAB ===================== */}
            {activeTab === 'ranking' && stats && stats.byOperator.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Ranking por Suma de Tiempo Muerto</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          const params = new URLSearchParams();
                          if (selectedTurno !== 'all') params.set('turno', selectedTurno);
                          if (selectedDate !== 'all') params.set('fecha', selectedDate);
                          window.open(`/api/export-ranking?${params}`, '_blank');
                        }}
                      >
                        <Download className="h-3 w-3" />
                        <span className="hidden sm:inline">Descargar Excel</span>
                      </Button>
                      <span className="text-xs text-muted-foreground">{stats.byOperator.length} operadores</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-12 text-center">#</TableHead>
                          <TableHead className="text-xs">Operador</TableHead>
                          <TableHead className="text-xs text-center">Turno</TableHead>
                          <TableHead className="text-xs text-right">Tiempo Bruto</TableHead>
                          <TableHead className="text-xs text-right">Descanso</TableHead>
                          <TableHead className="text-xs text-right">T. Muerto Inf.</TableHead>
                          <TableHead className="text-xs text-right">Tiempo Neto</TableHead>
                          <TableHead className="text-xs text-center">Dias</TableHead>
                          <TableHead className="text-xs text-right">Bultos</TableHead>
                          <TableHead className="text-xs text-right">Eventos</TableHead>
                          <TableHead className="text-xs text-right">Mayor Gap</TableHead>
                          <TableHead className="text-xs w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.byOperator.map((op, i) => {
                          const isTop3 = i < 3;
                          return (
                            <TableRow key={op.codUti}
                              className={`${isTop3 ? 'bg-red-50 hover:bg-red-100/70' : 'cursor-pointer hover:bg-slate-50'}`}
                              onClick={() => handleOperatorClick(op.codUti)}
                            >
                              <TableCell className="text-center">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  isTop3 ? 'bg-red-500 text-white' : i < 10 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-muted-foreground'
                                }`}>{i + 1}</span>
                              </TableCell>
                              <TableCell>
                                <div className="text-xs font-medium">{op.nomUti}</div>
                                <div className="text-[10px] text-muted-foreground">{op.codUti}</div>
                              </TableCell>
                              <TableCell className="text-center"><TurnoBadge turno={op.turno} /></TableCell>
                              <TableCell className="text-xs text-right font-bold">
                                <span className={isTop3 ? 'text-red-600' : op.totalMin > 100 ? 'text-orange-600' : ''}>
                                  {fmtDur(op.totalMinSec)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{op.descansoMin > 0 ? `-${fmtDur(op.descansoMinSec)}` : '—'}</span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${op.tmInfMin > 0 ? 'bg-purple-100 text-purple-700' : 'bg-slate-50 text-muted-foreground'}`}>
                                  {op.tmInfMin > 0 ? `-${op.tmInfMin} min` : '—'}
                                </span>
                                {op.tmInfEventos > 0 && <div className="text-[9px] text-purple-500 text-center">{op.tmInfEventos} ev.</div>}
                              </TableCell>
                              <TableCell className="text-xs text-right font-bold">
                                <span className="text-green-700">
                                  {fmtDur(op.totalNetoMinSec)}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-center text-muted-foreground">{op.diasTrabajados}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{op.totalBultos.toLocaleString('es-AR')}</TableCell>
                              <TableCell className="text-xs text-right">{op.events}</TableCell>
                              <TableCell className="text-xs text-right font-mono">{fmtDur(op.maxGap)}</TableCell>
                              <TableCell className="text-center"><span className="text-[10px] text-muted-foreground">ver</span></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ===================== POR OPERADOR TAB ===================== */}
            {activeTab === 'operador' && (
              selectedOp === 'all' ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12">
                    <User className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Seleccioná un operador del ranking o del filtro para ver sus eventos</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h3 className="text-sm font-semibold">Eventos de {selectedOpName}</h3>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            const params = new URLSearchParams();
                            params.set('operator', selectedOp);
                            if (selectedTurno !== 'all') params.set('turno', selectedTurno);
                            if (selectedDate !== 'all') params.set('fecha', selectedDate);
                            window.open(`/api/export-operator?${params}`, '_blank');
                          }}
                        >
                          <Download className="h-3 w-3" />
                          <span className="hidden sm:inline">Descargar Excel</span>
                        </Button>
                        <span className="text-xs text-muted-foreground">{gapTotal} gaps &gt;5 min</span>
                      </div>
                    </div>
                    {gapLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>
                      </div>
                    ) : gaps.length === 0 ? (
                      <div className="text-center py-12 text-sm text-muted-foreground">No se encontraron gaps mayores a 5 minutos</div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-10 text-center">#</TableHead>
                                <TableHead className="text-xs">Fecha</TableHead>
                                <TableHead className="text-xs text-center w-14">Turno</TableHead>
                                <TableHead className="text-xs text-center bg-blue-50" colSpan={4}>Pickeo Previo</TableHead>
                                <TableHead className="text-xs text-center">Trayecto</TableHead>
                                <TableHead className="text-xs text-center text-red-600 font-bold">Gap</TableHead>
                                <TableHead className="text-xs text-center bg-green-50" colSpan={4}>Pickeo Posterior</TableHead>
                              </TableRow>
                              <TableRow>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Zona</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Bultos</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Producto</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground">Zona → Zona</TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Zona</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Bultos</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Producto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {gaps.map((row) => {
                                const isTop3 = row.rank <= 3;
                                const sameZone = row.prevZonSts === row.currZonSts;
                                return (
                                  <TableRow key={`${row.fecha}-${row.prevHora}-${row.currHora}`}
                                    className={isTop3 ? 'bg-red-50 hover:bg-red-100/70' : ''}>
                                    <TableCell className="text-center">
                                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                        isTop3 ? 'bg-red-500 text-white' : 'bg-slate-100 text-muted-foreground'
                                      }`}>{row.rank}</span>
                                    </TableCell>
                                    <TableCell className="text-xs whitespace-nowrap">{row.fecha}</TableCell>
                                    <TableCell className="text-center"><TurnoBadge turno={row.turno} /></TableCell>
                                    <TableCell className="text-xs font-mono text-muted-foreground bg-blue-50/50">{row.prevHora}</TableCell>
                                    <TableCell className="text-xs bg-blue-50/50">
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 text-[10px] font-semibold">{row.prevZonSts || '—'}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-semibold bg-blue-50/50 text-blue-700">{row.prevBultos}</TableCell>
                                    <TableCell className="text-[10px] font-mono text-muted-foreground bg-blue-50/50 max-w-[110px] truncate">{row.prevCodPro}</TableCell>
                                    <TableCell className="text-center px-1">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${sameZone ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{row.prevZonSts || '?'}</span>
                                        <ArrowRight className={`h-3 w-3 ${sameZone ? 'text-slate-300' : 'text-amber-500'}`} />
                                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${sameZone ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{row.currZonSts || '?'}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className="text-xs font-bold px-2 py-1 rounded bg-red-500 text-white whitespace-nowrap">{fmtDur(row.gapSeconds)}</span>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-muted-foreground bg-green-50/50">{row.currHora}</TableCell>
                                    <TableCell className="text-xs bg-green-50/50">
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-green-200 text-green-800 text-[10px] font-semibold">{row.currZonSts || '—'}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-semibold bg-green-50/50 text-green-700">{row.currBultos}</TableCell>
                                    <TableCell className="text-[10px] font-mono text-muted-foreground bg-green-50/50 max-w-[110px] truncate">{row.currCodPro}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <span className="text-xs text-muted-foreground">Página {gapPage} de {gapTotalPages} ({gapTotal} gaps)</span>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={gapPage <= 1} onClick={() => fetchGaps(gapPage - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                            <span className="text-xs px-2">{gapPage} / {gapTotalPages}</span>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={gapPage >= gapTotalPages} onClick={() => fetchGaps(gapPage + 1)}><ChevronRight className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            )}

            {/* ===================== PREP STD TAB ===================== */}
            {activeTab === 'prep-std' && (
              stdSelectedOp === 'all' ? (
                stdStats && stdStats.byOperator.length > 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h3 className="text-sm font-semibold text-blue-700">Ranking Preparación STD</h3>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              const params = new URLSearchParams();
                              params.set('zona', 'std');
                              if (selectedTurno !== 'all') params.set('turno', selectedTurno);
                              if (selectedDate !== 'all') params.set('fecha', selectedDate);
                              window.open(`/api/export-ranking?${params}`, '_blank');
                            }}
                          >
                            <Download className="h-3 w-3" />
                            <span className="hidden sm:inline">Descargar Excel</span>
                          </Button>
                          <span className="text-xs text-muted-foreground">{stdStats.byOperator.length} operadores</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-12 text-center">#</TableHead>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs text-center">Turno</TableHead>
                              <TableHead className="text-xs text-right">Tiempo Bruto</TableHead>
                              <TableHead className="text-xs text-right">Descanso</TableHead>
                              <TableHead className="text-xs text-right">T. Muerto Inf.</TableHead>
                              <TableHead className="text-xs text-right">Tiempo Neto</TableHead>
                              <TableHead className="text-xs text-center">Dias</TableHead>
                              <TableHead className="text-xs text-right">Bultos</TableHead>
                              <TableHead className="text-xs text-right">Eventos</TableHead>
                              <TableHead className="text-xs text-right">Mayor Gap</TableHead>
                              <TableHead className="text-xs w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stdStats.byOperator.map((op, i) => {
                              const isTop3 = i < 3;
                              return (
                                <TableRow key={`std-${op.codUti}`}
                                  className={`${isTop3 ? 'bg-blue-50 hover:bg-blue-100/70' : 'cursor-pointer hover:bg-slate-50'}`}
                                  onClick={() => { setStdSelectedOp(op.codUti); setStdGapPage(1); }}
                                >
                                  <TableCell className="text-center">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                      isTop3 ? 'bg-blue-500 text-white' : i < 10 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-muted-foreground'
                                    }`}>{i + 1}</span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-xs font-medium">{op.nomUti}</div>
                                    <div className="text-[10px] text-muted-foreground">{op.codUti}</div>
                                  </TableCell>
                                  <TableCell className="text-center"><TurnoBadge turno={op.turno} /></TableCell>
                                  <TableCell className="text-xs text-right font-bold text-blue-600">{fmtDur(op.totalMinSec)}</TableCell>
                                  <TableCell className="text-right">
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{op.descansoMin > 0 ? `-${fmtDur(op.descansoMinSec)}` : '—'}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${op.tmInfMin > 0 ? 'bg-purple-100 text-purple-700' : 'bg-slate-50 text-muted-foreground'}`}>
                                      {op.tmInfMin > 0 ? `-${op.tmInfMin} min` : '—'}
                                    </span>
                                    {op.tmInfEventos > 0 && <div className="text-[9px] text-purple-500 text-center">{op.tmInfEventos} ev.</div>}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-bold text-green-700">{fmtDur(op.totalNetoMinSec)}</TableCell>
                                  <TableCell className="text-xs text-center text-muted-foreground">{op.diasTrabajados}</TableCell>
                                  <TableCell className="text-xs text-right font-medium">{op.totalBultos.toLocaleString('es-AR')}</TableCell>
                                  <TableCell className="text-xs text-right">{op.events}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">{fmtDur(op.maxGap)}</TableCell>
                                  <TableCell className="text-center"><span className="text-[10px] text-muted-foreground">ver</span></TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center py-12">
                      <Package className="h-10 w-10 text-blue-200 mb-3" />
                      <p className="text-sm text-muted-foreground">Sin datos para Preparación STD (zonas sin V)</p>
                    </CardContent>
                  </Card>
                )
              ) : (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setStdSelectedOp('all'); }}>
                          <ChevronLeft className="h-3 w-3" /> STD
                        </Button>
                        <h3 className="text-sm font-semibold text-blue-700">
                          {stdStats?.byOperator.find(o => o.codUti === stdSelectedOp)?.nomUti || stdSelectedOp}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => {
                            const params = new URLSearchParams();
                            const opStat = stdStats?.byOperator.find(o => o.codUti === stdSelectedOp);
                            params.set('codUti', stdSelectedOp);
                            params.set('nomUti', opStat?.nomUti || '');
                            params.set('turno', opStat?.turno || '');
                            params.set('tiempoNetoMin', String(opStat?.totalNetoMin || 0));
                            params.set('tiempoBrutoMin', String(opStat?.totalMin || 0));
                            params.set('descansoMin', String(opStat?.descansoMin || 0));

                            window.open(`/sanciones?${params}`, '_blank');
                          }}
                        >
                          <Shield className="h-3 w-3" />
                          Sanción
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            const params = new URLSearchParams();
                            params.set('zona', 'std');
                            params.set('operator', stdSelectedOp);
                            if (selectedTurno !== 'all') params.set('turno', selectedTurno);
                            if (selectedDate !== 'all') params.set('fecha', selectedDate);
                            window.open(`/api/export-operator?${params}`, '_blank');
                          }}
                        >
                          <Download className="h-3 w-3" />
                          <span className="hidden sm:inline">Descargar Excel</span>
                        </Button>
                        <span className="text-xs text-muted-foreground">{stdGapTotal} gaps &gt;5 min</span>
                      </div>
                    </div>
                    {stdGapLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>
                      </div>
                    ) : stdGaps.length === 0 ? (
                      <div className="text-center py-12 text-sm text-muted-foreground">No se encontraron gaps mayores a 5 minutos</div>
                    ) : (
                      <>
                        {(() => {
                          const opStat = stdStats?.byOperator.find(o => o.codUti === stdSelectedOp);
                          if (!opStat) return null;
                          return (
                            <div className="grid grid-cols-4 gap-3 text-center text-xs mb-3 p-2 bg-blue-50/60 rounded-lg border border-blue-100">
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">Bultos</p>
                                <p className="font-bold text-slate-800">{(opStat.totalBultos || 0).toLocaleString('es-AR')}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">T. Bruto</p>
                                <p className="font-bold text-red-600">{opStat.totalMin} min</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">Descanso</p>
                                <p className="font-bold text-slate-500">{opStat.descansoMin > 0 ? `${opStat.descansoMin} min` : '—'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">T. Neto</p>
                                <p className="font-bold text-green-700">{opStat.totalNetoMin} min</p>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-10 text-center">#</TableHead>
                                <TableHead className="text-xs">Fecha</TableHead>
                                <TableHead className="text-xs text-center w-14">Turno</TableHead>
                                <TableHead className="text-xs text-center bg-blue-50" colSpan={4}>Pickeo Previo</TableHead>
                                <TableHead className="text-xs text-center">Trayecto</TableHead>
                                <TableHead className="text-xs text-center text-red-600 font-bold">Gap</TableHead>
                                <TableHead className="text-xs text-center bg-green-50" colSpan={4}>Pickeo Posterior</TableHead>
                              </TableRow>
                              <TableRow>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Zona</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Bultos</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Producto</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground">Zona → Zona</TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Zona</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Bultos</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Producto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stdGaps.map((row) => {
                                const isTop3 = row.rank <= 3;
                                const sameZone = row.prevZonSts === row.currZonSts;
                                return (
                                  <TableRow key={`std-${row.fecha}-${row.prevHora}-${row.currHora}`}
                                    className={isTop3 ? 'bg-blue-50 hover:bg-blue-100/70' : ''}>
                                    <TableCell className="text-center">
                                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                        isTop3 ? 'bg-blue-500 text-white' : 'bg-slate-100 text-muted-foreground'
                                      }`}>{row.rank}</span>
                                    </TableCell>
                                    <TableCell className="text-xs whitespace-nowrap">{row.fecha}</TableCell>
                                    <TableCell className="text-center"><TurnoBadge turno={row.turno} /></TableCell>
                                    <TableCell className="text-xs font-mono text-muted-foreground bg-blue-50/50">{row.prevHora}</TableCell>
                                    <TableCell className="text-xs bg-blue-50/50">
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 text-[10px] font-semibold">{row.prevZonSts || '—'}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-semibold bg-blue-50/50 text-blue-700">{row.prevBultos}</TableCell>
                                    <TableCell className="text-[10px] font-mono text-muted-foreground bg-blue-50/50 max-w-[110px] truncate">{row.prevCodPro}</TableCell>
                                    <TableCell className="text-center px-1">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${sameZone ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{row.prevZonSts || '?'}</span>
                                        <ArrowRight className={`h-3 w-3 ${sameZone ? 'text-slate-300' : 'text-amber-500'}`} />
                                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${sameZone ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{row.currZonSts || '?'}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className="text-xs font-bold px-2 py-1 rounded bg-red-500 text-white whitespace-nowrap">{fmtDur(row.gapSeconds)}</span>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-muted-foreground bg-green-50/50">{row.currHora}</TableCell>
                                    <TableCell className="text-xs bg-green-50/50">
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-green-200 text-green-800 text-[10px] font-semibold">{row.currZonSts || '—'}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-semibold bg-green-50/50 text-green-700">{row.currBultos}</TableCell>
                                    <TableCell className="text-[10px] font-mono text-muted-foreground bg-green-50/50 max-w-[110px] truncate">{row.currCodPro}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <span className="text-xs text-muted-foreground">Página {stdGapPage} de {stdGapTotalPages} ({stdGapTotal} gaps)</span>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={stdGapPage <= 1} onClick={() => setStdGapPage(p => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                            <span className="text-xs px-2">{stdGapPage} / {stdGapTotalPages}</span>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={stdGapPage >= stdGapTotalPages} onClick={() => setStdGapPage(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            )}

            {/* ===================== PREP XD TAB ===================== */}
            {activeTab === 'prep-xd' && (
              xdSelectedOp === 'all' ? (
                xdStats && xdStats.byOperator.length > 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h3 className="text-sm font-semibold text-purple-700">Ranking Preparación XD</h3>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              const params = new URLSearchParams();
                              params.set('zona', 'xd');
                              if (selectedTurno !== 'all') params.set('turno', selectedTurno);
                              if (selectedDate !== 'all') params.set('fecha', selectedDate);
                              window.open(`/api/export-ranking?${params}`, '_blank');
                            }}
                          >
                            <Download className="h-3 w-3" />
                            <span className="hidden sm:inline">Descargar Excel</span>
                          </Button>
                          <span className="text-xs text-muted-foreground">{xdStats.byOperator.length} operadores</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-12 text-center">#</TableHead>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs text-center">Turno</TableHead>
                              <TableHead className="text-xs text-right">Tiempo Bruto</TableHead>
                              <TableHead className="text-xs text-right">Descanso</TableHead>
                              <TableHead className="text-xs text-right">T. Muerto Inf.</TableHead>
                              <TableHead className="text-xs text-right">Tiempo Neto</TableHead>
                              <TableHead className="text-xs text-center">Dias</TableHead>
                              <TableHead className="text-xs text-right">Bultos</TableHead>
                              <TableHead className="text-xs text-right">Eventos</TableHead>
                              <TableHead className="text-xs text-right">Mayor Gap</TableHead>
                              <TableHead className="text-xs w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {xdStats.byOperator.map((op, i) => {
                              const isTop3 = i < 3;
                              return (
                                <TableRow key={`xd-${op.codUti}`}
                                  className={`${isTop3 ? 'bg-purple-50 hover:bg-purple-100/70' : 'cursor-pointer hover:bg-slate-50'}`}
                                  onClick={() => { setXdSelectedOp(op.codUti); setXdGapPage(1); }}
                                >
                                  <TableCell className="text-center">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                      isTop3 ? 'bg-purple-500 text-white' : i < 10 ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-muted-foreground'
                                    }`}>{i + 1}</span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-xs font-medium">{op.nomUti}</div>
                                    <div className="text-[10px] text-muted-foreground">{op.codUti}</div>
                                  </TableCell>
                                  <TableCell className="text-center"><TurnoBadge turno={op.turno} /></TableCell>
                                  <TableCell className="text-xs text-right font-bold text-purple-600">{fmtDur(op.totalMinSec)}</TableCell>
                                  <TableCell className="text-right">
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{op.descansoMin > 0 ? `-${fmtDur(op.descansoMinSec)}` : '—'}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${op.tmInfMin > 0 ? 'bg-purple-100 text-purple-700' : 'bg-slate-50 text-muted-foreground'}`}>
                                      {op.tmInfMin > 0 ? `-${op.tmInfMin} min` : '—'}
                                    </span>
                                    {op.tmInfEventos > 0 && <div className="text-[9px] text-purple-500 text-center">{op.tmInfEventos} ev.</div>}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-bold text-green-700">{fmtDur(op.totalNetoMinSec)}</TableCell>
                                  <TableCell className="text-xs text-center text-muted-foreground">{op.diasTrabajados}</TableCell>
                                  <TableCell className="text-xs text-right font-medium">{op.totalBultos.toLocaleString('es-AR')}</TableCell>
                                  <TableCell className="text-xs text-right">{op.events}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">{fmtDur(op.maxGap)}</TableCell>
                                  <TableCell className="text-center"><span className="text-[10px] text-muted-foreground">ver</span></TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center py-12">
                      <Package className="h-10 w-10 text-purple-200 mb-3" />
                      <p className="text-sm text-muted-foreground">Sin datos para Preparación XD (zonas con V)</p>
                    </CardContent>
                  </Card>
                )
              ) : (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setXdSelectedOp('all'); }}>
                          <ChevronLeft className="h-3 w-3" /> XD
                        </Button>
                        <h3 className="text-sm font-semibold text-purple-700">
                          {xdStats?.byOperator.find(o => o.codUti === xdSelectedOp)?.nomUti || xdSelectedOp}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => {
                            const params = new URLSearchParams();
                            const opStat = xdStats?.byOperator.find(o => o.codUti === xdSelectedOp);
                            params.set('codUti', xdSelectedOp);
                            params.set('nomUti', opStat?.nomUti || '');
                            params.set('turno', opStat?.turno || '');
                            params.set('tiempoNetoMin', String(opStat?.totalNetoMin || 0));
                            params.set('tiempoBrutoMin', String(opStat?.totalMin || 0));
                            params.set('descansoMin', String(opStat?.descansoMin || 0));

                            window.open(`/sanciones?${params}`, '_blank');
                          }}
                        >
                          <Shield className="h-3 w-3" />
                          Sanción
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            const params = new URLSearchParams();
                            params.set('zona', 'xd');
                            params.set('operator', xdSelectedOp);
                            if (selectedTurno !== 'all') params.set('turno', selectedTurno);
                            if (selectedDate !== 'all') params.set('fecha', selectedDate);
                            window.open(`/api/export-operator?${params}`, '_blank');
                          }}
                        >
                          <Download className="h-3 w-3" />
                          <span className="hidden sm:inline">Descargar Excel</span>
                        </Button>
                        <span className="text-xs text-muted-foreground">{xdGapTotal} gaps &gt;5 min</span>
                      </div>
                    </div>
                    {xdGapLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>
                      </div>
                    ) : xdGaps.length === 0 ? (
                      <div className="text-center py-12 text-sm text-muted-foreground">No se encontraron gaps mayores a 5 minutos</div>
                    ) : (
                      <>
                        {(() => {
                          const opStat = xdStats?.byOperator.find(o => o.codUti === xdSelectedOp);
                          if (!opStat) return null;
                          return (
                            <div className="grid grid-cols-4 gap-3 text-center text-xs mb-3 p-2 bg-purple-50/60 rounded-lg border border-purple-100">
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">Bultos</p>
                                <p className="font-bold text-slate-800">{(opStat.totalBultos || 0).toLocaleString('es-AR')}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">T. Bruto</p>
                                <p className="font-bold text-red-600">{opStat.totalMin} min</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">Descanso</p>
                                <p className="font-bold text-slate-500">{opStat.descansoMin > 0 ? `${opStat.descansoMin} min` : '—'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">T. Neto</p>
                                <p className="font-bold text-green-700">{opStat.totalNetoMin} min</p>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-10 text-center">#</TableHead>
                                <TableHead className="text-xs">Fecha</TableHead>
                                <TableHead className="text-xs text-center w-14">Turno</TableHead>
                                <TableHead className="text-xs text-center bg-blue-50" colSpan={4}>Pickeo Previo</TableHead>
                                <TableHead className="text-xs text-center">Trayecto</TableHead>
                                <TableHead className="text-xs text-center text-red-600 font-bold">Gap</TableHead>
                                <TableHead className="text-xs text-center bg-green-50" colSpan={4}>Pickeo Posterior</TableHead>
                              </TableRow>
                              <TableRow>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Zona</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Bultos</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Producto</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground">Zona → Zona</TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Zona</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Bultos</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Producto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {xdGaps.map((row) => {
                                const isTop3 = row.rank <= 3;
                                const sameZone = row.prevZonSts === row.currZonSts;
                                return (
                                  <TableRow key={`xd-${row.fecha}-${row.prevHora}-${row.currHora}`}
                                    className={isTop3 ? 'bg-purple-50 hover:bg-purple-100/70' : ''}>
                                    <TableCell className="text-center">
                                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                        isTop3 ? 'bg-purple-500 text-white' : 'bg-slate-100 text-muted-foreground'
                                      }`}>{row.rank}</span>
                                    </TableCell>
                                    <TableCell className="text-xs whitespace-nowrap">{row.fecha}</TableCell>
                                    <TableCell className="text-center"><TurnoBadge turno={row.turno} /></TableCell>
                                    <TableCell className="text-xs font-mono text-muted-foreground bg-blue-50/50">{row.prevHora}</TableCell>
                                    <TableCell className="text-xs bg-blue-50/50">
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 text-[10px] font-semibold">{row.prevZonSts || '—'}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-semibold bg-blue-50/50 text-blue-700">{row.prevBultos}</TableCell>
                                    <TableCell className="text-[10px] font-mono text-muted-foreground bg-blue-50/50 max-w-[110px] truncate">{row.prevCodPro}</TableCell>
                                    <TableCell className="text-center px-1">
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${sameZone ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{row.prevZonSts || '?'}</span>
                                        <ArrowRight className={`h-3 w-3 ${sameZone ? 'text-slate-300' : 'text-amber-500'}`} />
                                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${sameZone ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{row.currZonSts || '?'}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className="text-xs font-bold px-2 py-1 rounded bg-red-500 text-white whitespace-nowrap">{fmtDur(row.gapSeconds)}</span>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-muted-foreground bg-green-50/50">{row.currHora}</TableCell>
                                    <TableCell className="text-xs bg-green-50/50">
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-green-200 text-green-800 text-[10px] font-semibold">{row.currZonSts || '—'}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-semibold bg-green-50/50 text-green-700">{row.currBultos}</TableCell>
                                    <TableCell className="text-[10px] font-mono text-muted-foreground bg-green-50/50 max-w-[110px] truncate">{row.currCodPro}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <span className="text-xs text-muted-foreground">Página {xdGapPage} de {xdGapTotalPages} ({xdGapTotal} gaps)</span>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={xdGapPage <= 1} onClick={() => setXdGapPage(p => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                            <span className="text-xs px-2">{xdGapPage} / {xdGapTotalPages}</span>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={xdGapPage >= xdGapTotalPages} onClick={() => setXdGapPage(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            )}

            {/* ===================== PICKS TAB ===================== */}
            {activeTab === 'picks' && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Primer y Último Pikeo por Colaborador</h3>
                    <span className="text-xs text-muted-foreground">{picksTotal} registros</span>
                  </div>
                  {picksLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>
                    </div>
                  ) : picks.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">Sin datos</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs text-center w-14">Turno</TableHead>
                              <TableHead className="text-xs text-center">Escaneos</TableHead>
                              <TableHead className="text-xs text-center bg-blue-50" colSpan={3}>
                                <span className="flex items-center justify-center gap-1"><PlayCircle className="h-3 w-3 text-blue-500" /> Primer Pikeo</span>
                              </TableHead>
                              <TableHead className="text-xs text-center">Jornada</TableHead>
                              <TableHead className="text-xs text-center">Descanso</TableHead>
                              <TableHead className="text-xs text-center">Efectiva</TableHead>
                              <TableHead className="text-xs text-center bg-green-50" colSpan={3}>
                                <span className="flex items-center justify-center gap-1"><StopCircle className="h-3 w-3 text-green-500" /> Último Pikeo</span>
                              </TableHead>
                            </TableRow>
                            <TableRow>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Hora</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Zona</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Producto</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Bruta</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">35m</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Neta</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground bg-green-50">Hora</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground bg-green-50">Zona</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground bg-green-50">Producto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {picks.map((row, i) => (
                              <TableRow key={`${row.codUti}-${row.fecha}`}
                                className="cursor-pointer hover:bg-slate-50"
                                onClick={() => handleOperatorClick(row.codUti)}
                              >
                                <TableCell>
                                  <div className="text-xs font-medium">{row.nomUti}</div>
                                  <div className="text-[10px] text-muted-foreground">{row.codUti}</div>
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap">{row.fecha}</TableCell>
                                <TableCell className="text-center"><TurnoBadge turno={row.turno} /></TableCell>
                                <TableCell className="text-xs text-center font-mono">{row.totalScans}</TableCell>
                                {/* Primer pikeo */}
                                <TableCell className="text-xs font-mono text-blue-700 bg-blue-50/50">{row.primerHora}</TableCell>
                                <TableCell className="text-xs bg-blue-50/50">
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 text-[10px] font-semibold">{row.primerZona || '—'}</span>
                                </TableCell>
                                <TableCell className="text-[10px] font-mono text-muted-foreground bg-blue-50/50 max-w-[110px] truncate">{row.primerProducto}</TableCell>
                                {/* Jornada Bruta */}
                                <TableCell className="text-center">
                                  <span className="text-xs text-muted-foreground">{fmtDur(row.jornadaSec)}</span>
                                </TableCell>
                                {/* Descanso */}
                                <TableCell className="text-center">
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">-35m</span>
                                </TableCell>
                                {/* Jornada Efectiva */}
                                <TableCell className="text-center">
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    row.jornadaEfectivaSec < 3600 ? 'bg-green-100 text-green-700'
                                    : row.jornadaEfectivaSec < 21600 ? 'bg-amber-100 text-amber-700'
                                    : 'bg-red-100 text-red-700'
                                  }`}>
                                    {fmtDur(row.jornadaEfectivaSec)}
                                  </span>
                                </TableCell>
                                {/* Último pikeo */}
                                <TableCell className="text-xs font-mono text-green-700 bg-green-50/50">{row.ultimoHora}</TableCell>
                                <TableCell className="text-xs bg-green-50/50">
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-green-200 text-green-800 text-[10px] font-semibold">{row.ultimoZona || '—'}</span>
                                </TableCell>
                                <TableCell className="text-[10px] font-mono text-muted-foreground bg-green-50/50 max-w-[110px] truncate">{row.ultimoProducto}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <span className="text-xs text-muted-foreground">Página {picksPage} de {picksTotalPages} ({picksTotal} registros)</span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={picksPage <= 1} onClick={() => fetchPicks(picksPage - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                          <span className="text-xs px-2">{picksPage} / {picksTotalPages}</span>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={picksPage >= picksTotalPages} onClick={() => fetchPicks(picksPage + 1)}><ChevronRight className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ===================== SANCIONES TAB ===================== */}
            {activeTab === 'sanciones' && (() => {
              const filteredSanciones = sancionTurnoFilter === 'todos'
                ? sanciones
                : sanciones.filter((s: any) => s.turno === sancionTurnoFilter);
              const tmCount = sanciones.filter((s: any) => s.turno === 'TM').length;
              const ttCount = sanciones.filter((s: any) => s.turno === 'TT').length;
              const tnCount = sanciones.filter((s: any) => s.turno === 'TN').length;
              const sinTurno = sanciones.filter((s: any) => !s.turno).length;
              const totalCount = sanciones.length;
              const uniqueOps = new Set(filteredSanciones.map((s: any) => s.codUti)).size;
              const thisWeek = filteredSanciones.filter((s: any) => { const d = new Date(s.createdAt); const now = new Date(); return (now.getTime() - d.getTime()) / 86400000 <= 7; }).length;
              const thisFortnight = filteredSanciones.filter((s: any) => { const d = new Date(s.createdAt); const now = new Date(); return (now.getTime() - d.getTime()) / 86400000 <= 15; }).length;

              return (
              <div className="space-y-4">
                {/* Turno sub-tabs */}
                <div className="flex items-center gap-1 border-b border-slate-200">
                  <button
                    onClick={() => setSancionTurnoFilter('todos')}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                      sancionTurnoFilter === 'todos' ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Todos <span className="ml-1 text-[10px] text-muted-foreground">({totalCount})</span>
                  </button>
                  <button
                    onClick={() => setSancionTurnoFilter('TM')}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                      sancionTurnoFilter === 'TM' ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sun className="h-3 w-3 inline mr-1" />
                    Mañana <span className="ml-1 text-[10px] text-muted-foreground">({tmCount})</span>
                  </button>
                  <button
                    onClick={() => setSancionTurnoFilter('TT')}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                      sancionTurnoFilter === 'TT' ? 'border-orange-500 text-orange-700' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sunset className="h-3 w-3 inline mr-1" />
                    Tarde <span className="ml-1 text-[10px] text-muted-foreground">({ttCount})</span>
                  </button>
                  <button
                    onClick={() => setSancionTurnoFilter('TN')}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                      sancionTurnoFilter === 'TN' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Moon className="h-3 w-3 inline mr-1" />
                    Noche <span className="ml-1 text-[10px] text-muted-foreground">({tnCount})</span>
                  </button>
                  {sinTurno > 0 && (
                    <span className="text-[10px] text-muted-foreground ml-2">({sinTurno} sin turno)</span>
                  )}
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-red-500 p-2"><Shield className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Total Sanciones</p>
                        <p className="text-lg sm:text-2xl font-bold">{filteredSanciones.length}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-orange-500 p-2"><User className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Operadores Sancionados</p>
                        <p className="text-lg sm:text-2xl font-bold">{uniqueOps}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-amber-500 p-2"><Clock className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Esta Semana</p>
                        <p className="text-lg sm:text-2xl font-bold">{thisWeek}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-purple-500 p-2"><AlertTriangle className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Esta Quincena</p>
                        <p className="text-lg sm:text-2xl font-bold">{thisFortnight}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (selectedOp !== 'all') {
                        params.set('codUti', selectedOp);
                        params.set('nomUti', selectedOpName || '');
                        const opStat = stats?.byOperator.find(o => o.codUti === selectedOp);
                        params.set('turno', opStat?.turno || '');
                        params.set('tiempoNetoMin', String(opStat?.totalNetoMin || 0));
                        params.set('tiempoBrutoMin', String(opStat?.totalMin || 0));
                        params.set('descansoMin', String(opStat?.descansoMin || 0));
                        params.set('bultos', String(opStat?.totalBultos || 0));
                      }
                      window.open(`/sanciones?${params}`, '_blank');
                    }}
                  >
                    <Shield className="h-3 w-3" />
                    Sanc. Tiempo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 border-blue-300 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (selectedOp !== 'all') {
                        params.set('codUti', selectedOp);
                        params.set('nomUti', selectedOpName || '');
                        const opStat = stats?.byOperator.find(o => o.codUti === selectedOp);
                        params.set('turno', opStat?.turno || '');
                      }
                      window.open(`/sanciones-inicio?${params}`, '_blank');
                    }}
                  >
                    <PlayCircle className="h-3 w-3" />
                    Sanc. Inicio
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => window.open('/api/export-sanciones', '_blank')}
                  >
                    <Download className="h-3 w-3" />
                    Descargar Excel
                  </Button>
                </div>

                {/* History table */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-3">
                      Historial de Sanciones
                      {sancionTurnoFilter !== 'todos' && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          — Filtrado: {sancionTurnoFilter === 'TM' ? 'Mañana' : sancionTurnoFilter === 'TT' ? 'Tarde' : 'Noche'}
                        </span>
                      )}
                    </h3>
                    {sancionesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>
                      </div>
                    ) : filteredSanciones.length === 0 ? (
                      <div className="text-center py-12 text-sm text-muted-foreground">
                        {sancionTurnoFilter === 'todos' ? 'No hay sanciones registradas' : `No hay sanciones para el turno ${sancionTurnoFilter}`}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs">Legajo</TableHead>
                              <TableHead className="text-xs">Nombre</TableHead>
                              <TableHead className="text-xs text-center">Turno</TableHead>
                              <TableHead className="text-xs text-center">Tipo</TableHead>
                              <TableHead className="text-xs text-right">T. Neto</TableHead>
                              <TableHead className="text-xs">Fecha Med.</TableHead>
                              <TableHead className="text-xs text-center">Sanc.</TableHead>
                              <TableHead className="text-xs">Ultima Sanc.</TableHead>
                              <TableHead className="text-xs w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredSanciones.slice(0, 50).map((s: any, i: number) => {
                              const counts = sancionesCounts[s.codUti];
                              return (
                                <TableRow
                                  key={s.id}
                                  className={`${i === 0 ? 'bg-red-50 hover:bg-red-100/70' : 'cursor-pointer hover:bg-slate-50'}`}
                                  onClick={() => {
                                    setSelectedOp(s.codUti);
                                    setActiveTab('operador');
                                  }}
                                >
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {s.createdAt ? s.createdAt.split('T')[0] : ''}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">{s.codUti}</TableCell>
                                  <TableCell className="text-xs">{s.nomUti}</TableCell>
                                  <TableCell className="text-center">
                                    {s.turno && <TurnoBadge turno={s.turno} />}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.tipo === 'inicio-tardio' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                      {s.tipo === 'inicio-tardio' ? 'Inicio' : 'Tiempo'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-bold text-red-600">
                                    {s.tiempoNeto != null ? `${s.tiempoNeto} min` : '—'}
                                  </TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{s.fechaMedicion || ''}</TableCell>
                                  <TableCell className="text-xs text-center">
                                    <span className="inline-flex items-center justify-center bg-red-100 text-red-700 text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1.5">
                                      {counts?.count || 0}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                    {counts?.lastDate || '—'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <button
                                      onClick={(e) => handleDeleteSancion(s.id, e)}
                                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                                      title="Eliminar sancion"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              );
            })()}
          </>
        )}

      </main>

      <footer className="mt-auto border-t bg-white/60">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
          <p className="text-center text-[10px] text-muted-foreground">
            Umbral: &gt;5 min = tiempo muerto — TM (6-14hs) TT (14-22hs) TN (resto)
          </p>
        </div>
      </footer>
    </div>
  );
}