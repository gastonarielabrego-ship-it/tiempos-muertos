'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Upload, RefreshCw, Clock, BarChart3, AlertTriangle,
  Loader2, Database, Timer, ChevronLeft, ChevronRight,
  X, ArrowDown, Trophy, ArrowRight, User, Sun, Sunset, Moon,
  PlayCircle, StopCircle, Download, FileSpreadsheet, Shield,
  Trash2, Coffee, FileText, TrendingDown,
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

type TabType = 'ranking' | 'operador' | 'picks' | 'sanciones' | 'indicadores';

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
  const [indicadores, setIndicadores] = useState<any[]>([]);
  const [indicadoresLoading, setIndicadoresLoading] = useState(false);
  const [savingIndicador, setSavingIndicador] = useState(false);
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

  const fetchIndicadores = useCallback(async () => {
    setIndicadoresLoading(true);
    try {
      const res = await fetch('/api/indicadores');
      const data = await res.json();
      setIndicadores(data.indicadores || []);
    } catch { /* silent */ }
    finally { setIndicadoresLoading(false); }
  }, []);

  const handleSaveIndicador = async () => {
    if (!stats) return;
    setSavingIndicador(true);
    try {
      const brutoMin = Math.round(stats.kpis.totalDeadTime / 60 * 10) / 10;
      const body = {
        fecha: selectedDate !== 'all' ? selectedDate : new Date().toISOString().split('T')[0],
        turno: selectedTurno !== 'all' ? selectedTurno : 'todos',
        brutoMin,
        descansoMin: stats.kpis.totalDescansoMin,
        tmInfMin: stats.kpis.totalTmInfMin,
        tmInfEventos: stats.kpis.totalTmInfEventos,
        netoMin: stats.kpis.totalNetoMin,
        totalBultos: stats.kpis.totalBultos || 0,
        totalPreparacionMin: stats.kpis.totalPreparacionMin || 0,
        totalColaboradores: stats.kpis.totalColaboradores || 0,
      };
      const res = await fetch('/api/indicadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: 'Indicador guardado' });
        fetchIndicadores();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'No se pudo guardar', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error al guardar indicador', variant: 'destructive' });
    } finally {
      setSavingIndicador(false);
    }
  };

  const handleDeleteIndicador = async (id: number) => {
    if (!confirm('Eliminar este registro de indicador?')) return;
    try {
      await fetch(`/api/indicadores?id=${id}`, { method: 'DELETE' });
      toast({ title: 'Indicador eliminado' });
      fetchIndicadores();
    } catch { /* silent */ }
  };

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
    if (activeTab === 'picks') fetchPicks(1);
    if (activeTab === 'sanciones') fetchSanciones();
    if (activeTab === 'indicadores') fetchIndicadores();
  }, [selectedOp, selectedTurno, selectedDate, activeTab, hasData]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Archivo muy grande', description: 'El archivo no debe superar los 10MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      // Read file as base64 and send as JSON to avoid Vercel FUNCTION_PAYLOAD_TOO_LARGE
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, fileName: file.name }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Error HTTP ${res.status}`);
      }
      const data = await res.json();
      toast({ title: 'Datos actualizados', description: `${data.totalRecords} registros cargados` });
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
              <Select value={selectedOp} onValueChange={handleOpChange}>
                <SelectTrigger className="w-full sm:w-[220px] h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los operadores</SelectItem>
                  {filters?.operators.filter(o => o.codUti.trim()).map(o => (
                    <SelectItem key={o.codUti} value={o.codUti}>{o.nomUti}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
                      Sanción
                    </Button>
                  </div>
                  <div className="space-y-1.5 text-sm">
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
                <button
                  onClick={() => setActiveTab('indicadores')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'indicadores' ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BarChart3 className="h-3 w-3 inline mr-1" />
                  Indicadores
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
            {activeTab === 'sanciones' && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-red-500 p-2"><Shield className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Total Sanciones</p>
                        <p className="text-lg sm:text-2xl font-bold">{sanciones.length}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-orange-500 p-2"><User className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Operadores Sancionados</p>
                        <p className="text-lg sm:text-2xl font-bold">{new Set(sanciones.map((s: any) => s.codUti)).size}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-amber-500 p-2"><Clock className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Esta Semana</p>
                        <p className="text-lg sm:text-2xl font-bold">{sanciones.filter((s: any) => { const d = new Date(s.createdAt); const now = new Date(); const diff = (now.getTime() - d.getTime()) / 86400000; return diff <= 7; }).length}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-purple-500 p-2"><AlertTriangle className="h-4 w-4 text-white" /></div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Esta Quincena</p>
                        <p className="text-lg sm:text-2xl font-bold">{sanciones.filter((s: any) => { const d = new Date(s.createdAt); const now = new Date(); const diff = (now.getTime() - d.getTime()) / 86400000; return diff <= 15; }).length}</p>
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
                      }
                      window.open(`/sanciones?${params}`, '_blank');
                    }}
                  >
                    <Shield className="h-3 w-3" />
                    Nueva Sanción
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
                    <h3 className="text-sm font-semibold mb-3">Historial de Sanciones</h3>
                    {sancionesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>
                      </div>
                    ) : sanciones.length === 0 ? (
                      <div className="text-center py-12 text-sm text-muted-foreground">No hay sanciones registradas</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs">Legajo</TableHead>
                              <TableHead className="text-xs">Nombre</TableHead>
                              <TableHead className="text-xs text-center">Turno</TableHead>
                              <TableHead className="text-xs text-right">T. Neto</TableHead>
                              <TableHead className="text-xs">Fecha Med.</TableHead>
                              <TableHead className="text-xs text-center">Sanc.</TableHead>
                              <TableHead className="text-xs">Ultima Sanc.</TableHead>
                              <TableHead className="text-xs w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sanciones.slice(0, 50).map((s: any, i: number) => {
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
            )}
          </>
        )}

            {/* ===================== INDICADORES TAB ===================== */}
            {activeTab === 'indicadores' && stats && !loading && (() => {
              const brutoMin = Math.round(stats.kpis.totalDeadTime / 60 * 10) / 10;
              const turnoLabel = selectedTurno !== 'all' ? selectedTurno : 'Todos';
              const fechaLabel = selectedDate !== 'all' ? selectedDate : 'Todas las fechas';
              const minToH = (m: number) => {
                const h = Math.floor(m / 60);
                const mins = Math.round(m % 60 * 10) / 10;
                return mins > 0 ? `${h}h ${mins}m` : `${h}h`;
              };
              const minToDecH = (m: number) => (m / 60);
              const capEquiv = (brutoMin: number) => {
                const horas = brutoMin / 60;
                return (horas / 8.35).toFixed(2);
              };
              const bultosPorHora = (bultos: number, prepMin: number) => {
                const horas = prepMin / 60;
                if (horas <= 0) return '0.00';
                return (bultos / horas).toFixed(2);
              };
              // Chart: group indicadores by turno, show neto trend
              const byTurnoChart: Record<string, any[]> = {};
              for (const ind of indicadores) {
                const t = ind.turno || 'todos';
                if (!byTurnoChart[t]) byTurnoChart[t] = [];
                byTurnoChart[t].push(ind);
              }
              // Sort each group by fecha
              for (const t of Object.keys(byTurnoChart)) {
                byTurnoChart[t].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
              }

              return (
                <div className="space-y-4">
                  {/* Header with save */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">Indicadores</h3>
                      <p className="text-[10px] text-muted-foreground">Fecha: {fechaLabel} — Turno: {turnoLabel}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSaveIndicador}
                      disabled={savingIndicador}
                      className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      {savingIndicador ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                      Guardar
                    </Button>
                  </div>

                  {/* Gráfico: Tiempo Neto por Turno */}
                  {indicadores.length >= 2 && Object.keys(byTurnoChart).length > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <h4 className="text-xs font-semibold mb-3">Indicador Tiempo Neto por Turno</h4>
                        <div className="space-y-4">
                          {Object.entries(byTurnoChart).map(([turno, items]) => {
                            if (items.length < 2) return null;
                            const maxVal = Math.max(...items.map((x: any) => x.netoMin || 0), 1);
                            return (
                              <div key={turno}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    turno === 'TM' ? 'bg-amber-100 text-amber-700' :
                                    turno === 'TT' ? 'bg-orange-100 text-orange-700' :
                                    turno === 'TN' ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>{turno.toUpperCase()}</span>
                                </div>
                                <div className="flex items-end gap-1 h-24">
                                  {items.map((ind: any, i: number) => {
                                    const val = ind.netoMin || 0;
                                    const prev = i > 0 ? (items[i - 1].netoMin || 0) : val;
                                    const wentUp = val >= prev;
                                    const barColor = wentUp ? 'bg-red-500' : 'bg-green-500';
                                    const h = Math.max((val / maxVal) * 100, 3);
                                    return (
                                      <div key={ind.id} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                                        <div className={`w-full ${barColor} rounded-t-sm transition-all cursor-default`} style={{ height: `${h}%` }} />
                                        <span className="text-[7px] text-muted-foreground leading-tight">{ind.fecha?.slice(5) || ''}</span>
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-[8px] rounded px-1.5 py-1 whitespace-nowrap z-10">
                                          {ind.fecha}: {minToH(val)}
                                          <span className={wentUp ? 'text-red-300' : 'text-green-300'}>
                                            {wentUp ? ' ↑' : ' ↓'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tabla de indicadores */}
                  <Card>
                    <CardContent className="p-4">
                      <h4 className="text-xs font-semibold mb-3">Registro de Indicadores</h4>
                      {indicadoresLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                      ) : indicadores.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground text-center py-6">No hay indicadores guardados. Presiona &quot;Guardar&quot; para registrar el estado actual.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-1.5 px-1.5 font-semibold">Fecha</th>
                                <th className="text-center py-1.5 px-1.5 font-semibold">Turno</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold text-cyan-700">T. Preparación</th>
                                <th className="text-center py-1.5 px-1.5 font-semibold text-slate-600">Colab.</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold text-slate-600">Bultos</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold text-red-600">TM Bruto</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold">Descanso</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold text-purple-600">TM Inf</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold text-green-700">TM Neto</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold text-blue-600">Cap. Equiv.</th>
                                <th className="text-right py-1.5 px-1.5 font-semibold text-emerald-600">Bultos/h</th>
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {indicadores.map((ind: any) => (
                                <tr key={ind.id} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="py-1.5 px-1.5">{ind.fecha}</td>
                                  <td className="py-1.5 px-1.5 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                      ind.turno === 'TM' ? 'bg-amber-100 text-amber-700' :
                                      ind.turno === 'TT' ? 'bg-orange-100 text-orange-700' :
                                      ind.turno === 'TN' ? 'bg-indigo-100 text-indigo-700' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>{ind.turno}</span>
                                  </td>
                                  <td className="py-1.5 px-1.5 text-right font-medium text-cyan-700">{minToH(ind.totalPreparacionMin || 0)}</td>
                                  <td className="py-1.5 px-1.5 text-center text-slate-600">{ind.totalColaboradores || 0}</td>
                                  <td className="py-1.5 px-1.5 text-right text-slate-600">{ind.totalBultos?.toLocaleString() || '0'}</td>
                                  <td className="py-1.5 px-1.5 text-right font-medium text-red-600">{minToH(ind.brutoMin || 0)}</td>
                                  <td className="py-1.5 px-1.5 text-right">{minToH(ind.descansoMin || 0)}</td>
                                  <td className="py-1.5 px-1.5 text-right text-purple-600">{minToH(ind.tmInfMin || 0)}</td>
                                  <td className="py-1.5 px-1.5 text-right font-bold text-green-700">{minToH(ind.netoMin || 0)}</td>
                                  <td className="py-1.5 px-1.5 text-right font-medium text-blue-600">{capEquiv(ind.brutoMin || 0)}</td>
                                  <td className="py-1.5 px-1.5 text-right font-medium text-emerald-600">{bultosPorHora(ind.totalBultos || 0, ind.totalPreparacionMin || 0)}</td>
                                  <td className="py-1.5 px-1.5">
                                    <button onClick={() => handleDeleteIndicador(ind.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
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