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
  X, ArrowDown, Trophy,
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

interface OpStat {
  codUti: string;
  nomUti: string;
  totalMin: number;
  events: number;
  maxGap: number;
}

interface GapRow {
  rank: number;
  codUti: string;
  nomUti: string;
  fecha: string;
  gapSeconds: number;
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

interface Filters {
  operators: { codUti: string; nomUti: string }[];
  totalRecords: number;
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// --- Main Page ---
export default function DashboardPage() {
  const [stats, setStats] = useState<{ kpis: KPIs; byOperator: OpStat[] } | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [gapSummary, setGapSummary] = useState<{ totalDeadTimeSec: number; totalDeadTimeFormatted: string; deadTimeCount: number } | null>(null);
  const [gapPage, setGapPage] = useState(1);
  const [gapTotalPages, setGapTotalPages] = useState(1);
  const [gapTotal, setGapTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gapLoading, setGapLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<string>('all');
  const [hasData, setHasData] = useState(true);
  const [activeTab, setActiveTab] = useState<'ranking' | 'operador'>('ranking');
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
      const res = await fetch(`/api/stats?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStats(data);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar las estadísticas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOp, toast]);

  const fetchGaps = useCallback(async (page: number) => {
    setGapLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '100');
      if (selectedOp !== 'all') params.set('operator', selectedOp);
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
  }, [selectedOp, toast]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  useEffect(() => {
    if (hasData) { fetchStats(); fetchGaps(1); }
    else { setLoading(false); setGapLoading(false); }
  }, [fetchStats, fetchGaps, hasData]);

  const handleOpChange = (val: string) => {
    setSelectedOp(val);
    setGapPage(1);
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
      await fetchFilters();
    } catch (err) {
      toast({ title: 'Error al cargar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
            <Button size="sm" onClick={() => { fetchStats(); fetchGaps(gapPage); }} disabled={loading || gapLoading}
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
            {/* Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Operador:</span>
              <Select value={selectedOp} onValueChange={handleOpChange}>
                <SelectTrigger className="w-full sm:w-[240px] h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los operadores</SelectItem>
                  {filters?.operators.map(o => (
                    <SelectItem key={o.codUti} value={o.codUti}>{o.nomUti}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOp !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => handleOpChange('all')} className="h-8 text-xs">
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

            {/* Summary box */}
            {gapSummary && (
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDown className="h-4 w-4 text-red-500" />
                    <h3 className="text-sm font-semibold text-red-700">Resumen de Tiempos Muertos (&gt;5 min)</h3>
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
                      <span className="font-bold text-red-700 text-base">{Math.round(gapSummary.totalDeadTimeSec / 60)} min</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">En horas</span>
                      <span className="font-bold text-red-700 text-base">{(gapSummary.totalDeadTimeSec / 3600).toFixed(1)} h</span>
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
                    activeTab === 'ranking'
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Trophy className="h-3 w-3 inline mr-1" />
                  Ranking de Gaps
                </button>
                <button
                  onClick={() => setActiveTab('operador')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'operador'
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Por Operador
                </button>
              </div>
            )}

            {/* Ranking Tab */}
            {activeTab === 'ranking' && gapSummary && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">
                      Ranking de Tiempos Muertos (mayor a menor)
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {gapTotal} gaps &gt;5 min encontrados
                    </span>
                  </div>

                  {gapLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Cargando...</span>
                    </div>
                  ) : gaps.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      No se encontraron gaps mayores a 5 minutos
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-12 text-center">#</TableHead>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs text-center" colSpan={3}>Escaneo Anterior</TableHead>
                              <TableHead className="text-xs text-center text-red-600 font-bold">Gap</TableHead>
                              <TableHead className="text-xs text-center" colSpan={3}>Escaneo Siguiente</TableHead>
                            </TableRow>
                            <TableRow>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Hora</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Zona</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Producto</TableHead>
                              <TableHead className="text-[10px]"></TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Hora</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Zona</TableHead>
                              <TableHead className="text-[10px] text-muted-foreground">Producto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {gaps.map((row) => {
                              const isTop3 = row.rank <= 3;
                              return (
                                <TableRow
                                  key={`${row.codUti}-${row.fecha}-${row.prevHora}-${row.currHora}`}
                                  className={isTop3 ? 'bg-red-50 hover:bg-red-100/70' : ''}
                                >
                                  <TableCell className="text-center">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                      isTop3
                                        ? 'bg-red-500 text-white'
                                        : 'bg-slate-100 text-muted-foreground'
                                    }`}>
                                      {row.rank}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-xs font-medium leading-tight">{row.nomUti}</div>
                                    <div className="text-[10px] text-muted-foreground">{row.codUti}</div>
                                  </TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{row.fecha}</TableCell>
                                  {/* Prev scan */}
                                  <TableCell className="text-xs font-mono text-muted-foreground">{row.prevHora}</TableCell>
                                  <TableCell className="text-xs">{row.prevZonSts || '—'}</TableCell>
                                  <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[110px] truncate">{row.prevCodPro}</TableCell>
                                  {/* Gap */}
                                  <TableCell className="text-center">
                                    <span className="text-xs font-bold px-2 py-1 rounded bg-red-500 text-white whitespace-nowrap">
                                      {fmtDur(row.gapSeconds)}
                                    </span>
                                  </TableCell>
                                  {/* Current scan */}
                                  <TableCell className="text-xs font-mono text-muted-foreground">{row.currHora}</TableCell>
                                  <TableCell className="text-xs">{row.currZonSts || '—'}</TableCell>
                                  <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[110px] truncate">{row.currCodPro}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <span className="text-xs text-muted-foreground">
                          Página {gapPage} de {gapTotalPages} ({gapTotal} gaps)
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={gapPage <= 1}
                            onClick={() => fetchGaps(gapPage - 1)}>
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <span className="text-xs px-2">{gapPage} / {gapTotalPages}</span>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={gapPage >= gapTotalPages}
                            onClick={() => fetchGaps(gapPage + 1)}>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Operador Tab */}
            {activeTab === 'operador' && stats && stats.byOperator.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3">Tiempos Muertos por Operador</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Operador</TableHead>
                          <TableHead className="text-xs text-right">Total (min)</TableHead>
                          <TableHead className="text-xs text-right">Eventos</TableHead>
                          <TableHead className="text-xs text-right">Mayor Gap</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.byOperator.map((op, i) => (
                          <TableRow key={op.codUti} className={i < 3 ? 'bg-red-50 hover:bg-red-100/70' : ''}>
                            <TableCell className="text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <div className="text-xs font-medium">{op.nomUti}</div>
                              <div className="text-[10px] text-muted-foreground">{op.codUti}</div>
                            </TableCell>
                            <TableCell className="text-xs text-right font-bold">
                              <span className={op.totalMin > 30 ? 'text-red-600' : op.totalMin > 15 ? 'text-orange-500' : ''}>
                                {op.totalMin} min
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right">{op.events}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{fmtDur(op.maxGap)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t bg-white/60">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
          <p className="text-center text-[10px] text-muted-foreground">
            Umbral: &gt;5 min = tiempo muerto — Next.js + SQLite
          </p>
        </div>
      </footer>
    </div>
  );
}