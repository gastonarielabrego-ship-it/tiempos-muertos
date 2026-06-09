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
  PlayCircle, StopCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// --- Types ---
interface KPIs {
  totalScans: number;
  totalDeadTime: number;
  deadTimeEvents: number;
  avgGap: number;
  maxGap: number;
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
}

interface Filters {
  operators: { codUti: string; nomUti: string }[];
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

type TabType = 'ranking' | 'operador' | 'picks';

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
  const [hasData, setHasData] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('ranking');
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOp !== 'all') params.set('operator', selectedOp);
      if (selectedTurno !== 'all') params.set('turno', selectedTurno);
      const res = await fetch(`/api/stats?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStats(data);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar las estadísticas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOp, selectedTurno, toast]);

  const fetchGaps = useCallback(async (page: number) => {
    setGapLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '50');
      if (selectedOp !== 'all') params.set('operator', selectedOp);
      if (selectedTurno !== 'all') params.set('turno', selectedTurno);
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
  }, [selectedOp, selectedTurno, toast]);

  const fetchPicks = useCallback(async (page: number) => {
    setPicksLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '100');
      if (selectedOp !== 'all') params.set('operator', selectedOp);
      if (selectedTurno !== 'all') params.set('turno', selectedTurno);
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
  }, [selectedOp, selectedTurno, toast]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  useEffect(() => {
    if (hasData) { fetchStats(); fetchGaps(1); fetchPicks(1); }
    else { setLoading(false); }
  }, [fetchStats, hasData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasData) return;
    fetchStats();
    if (activeTab === 'operador' && selectedOp !== 'all') fetchGaps(1);
    if (activeTab === 'picks') fetchPicks(1);
  }, [selectedOp, selectedTurno, activeTab, hasData]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: 'Datos actualizados', description: `${data.totalRecords} registros cargados` });
      setHasData(true);
      setSelectedOp('all');
      setSelectedTurno('all');
      setActiveTab('ranking');
      await fetchFilters();
    } catch (err) {
      toast({ title: 'Error al cargar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
                  {filters?.operators.map(o => (
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

              {(selectedOp !== 'all' || selectedTurno !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setSelectedOp('all'); setSelectedTurno('all'); setActiveTab('ranking'); }} className="h-8 text-xs">
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
                      TM (6-10hs) · TT (10-18hs) · TN (resto)
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
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-red-500" />
                    <h3 className="text-sm font-semibold text-red-700">{selectedOpName}</h3>
                    <TurnoBadge turno={selectedOpStats.turno} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Eventos</span>
                      <span className="font-bold text-red-600 text-base">{gapSummary.deadTimeCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Suma total</span>
                      <span className="font-bold text-red-600 text-base">{gapSummary.totalDeadTimeFormatted}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">En minutos</span>
                      <span className="font-bold text-red-700 text-base">{selectedOpStats.totalMin} min</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Mayor gap</span>
                      <span className="font-bold text-red-700 text-base">{fmtDur(selectedOpStats.maxGap)}</span>
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
              </div>
            )}

            {/* ===================== RANKING TAB ===================== */}
            {activeTab === 'ranking' && stats && stats.byOperator.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Ranking por Suma de Tiempo Muerto</h3>
                    <span className="text-xs text-muted-foreground">{stats.byOperator.length} operadores</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-12 text-center">#</TableHead>
                          <TableHead className="text-xs">Operador</TableHead>
                          <TableHead className="text-xs text-center">Turno</TableHead>
                          <TableHead className="text-xs text-right">Tiempo Total</TableHead>
                          <TableHead className="text-xs text-right">Minutos</TableHead>
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
                                  {fmtDur(op.totalMin * 60)}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-right font-bold">
                                <span className={isTop3 ? 'text-red-600' : ''}>{op.totalMin} min</span>
                              </TableCell>
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
                      <span className="text-xs text-muted-foreground">{gapTotal} gaps &gt;5 min</span>
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
                                <TableHead className="text-xs text-center bg-blue-50" colSpan={3}>Pickeo Previo</TableHead>
                                <TableHead className="text-xs text-center">Trayecto</TableHead>
                                <TableHead className="text-xs text-center text-red-600 font-bold">Gap</TableHead>
                                <TableHead className="text-xs text-center bg-green-50" colSpan={3}>Pickeo Posterior</TableHead>
                              </TableRow>
                              <TableRow>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Zona</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-blue-50">Producto</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground">Zona → Zona</TableHead>
                                <TableHead className="text-[10px]"></TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Hora</TableHead>
                                <TableHead className="text-[10px] text-muted-foreground bg-green-50">Zona</TableHead>
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
                              <TableHead className="text-[10px] text-muted-foreground">Duración</TableHead>
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
                                {/* Jornada */}
                                <TableCell className="text-center">
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    row.jornadaSec < 3600 ? 'bg-green-100 text-green-700'
                                    : row.jornadaSec < 21600 ? 'bg-amber-100 text-amber-700'
                                    : 'bg-red-100 text-red-700'
                                  }`}>
                                    {fmtDur(row.jornadaSec)}
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
          </>
        )}
      </main>

      <footer className="mt-auto border-t bg-white/60">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
          <p className="text-center text-[10px] text-muted-foreground">
            Umbral: &gt;5 min = tiempo muerto — TM (6-10hs) TT (10-18hs) TN (resto)
          </p>
        </div>
      </footer>
    </div>
  );
}