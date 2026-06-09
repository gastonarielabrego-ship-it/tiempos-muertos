'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
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
  TrendingUp, Loader2, Database, Timer, ChevronLeft, ChevronRight,
  X, ArrowDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

echarts.use([BarChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

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

interface MovementRow {
  id: number;
  codUti: string;
  nomUti: string;
  fecha: string;
  hora: string;
  codAct: number;
  zonSts: string | null;
  allSts: number;
  dplSts: number;
  nivSts: number;
  codPro: string;
  pcbPro: number;
  bultos: number;
  gapSeconds: number | null;
  isDeadTime: boolean;
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

function fmtGap(s: number | null): string {
  if (s === null) return '—';
  return fmtDur(s);
}

// --- Main Page ---
export default function DashboardPage() {
  const [stats, setStats] = useState<{ kpis: KPIs; byOperator: OpStat[] } | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movSummary, setMovSummary] = useState<{ totalDeadTimeSec: number; totalDeadTimeFormatted: string; deadTimeCount: number } | null>(null);
  const [movPage, setMovPage] = useState(1);
  const [movTotalPages, setMovTotalPages] = useState(1);
  const [movTotal, setMovTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [movLoading, setMovLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<string>('all');
  const [hasData, setHasData] = useState(true);
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

  const fetchMovements = useCallback(async (page: number) => {
    setMovLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '200');
      if (selectedOp !== 'all') params.set('operator', selectedOp);
      const res = await fetch(`/api/movements?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMovements(data.rows);
      setMovSummary(data.summary);
      setMovPage(data.pagination.page);
      setMovTotalPages(data.pagination.totalPages);
      setMovTotal(data.pagination.total);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los movimientos', variant: 'destructive' });
    } finally {
      setMovLoading(false);
    }
  }, [selectedOp, toast]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  useEffect(() => {
    if (hasData) { fetchStats(); fetchMovements(1); }
    else { setLoading(false); setMovLoading(false); }
  }, [fetchStats, fetchMovements, hasData]);

  const handleOpChange = (val: string) => {
    setSelectedOp(val);
    setMovPage(1);
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

  // EChart: dead time by operator
  const chartOption: echarts.EChartsOption = stats && stats.byOperator.length > 0 ? {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: unknown) => {
      const p = params as { name: string; value: number; seriesName: string }[];
      if (!p || !p[0]) return '';
      const op = stats.byOperator.find(o => o.nomUti.split(' ').slice(-2).join(' ') === p[0].name);
      return `<b>${p[0].name}</b><br/>Tiempo muerto: ${p[0].value} min<br/>Eventos: ${op?.events || 0}<br/>Máximo: ${op ? fmtDur(op.maxGap) : ''}`;
    }},
    grid: { left: '3%', right: '4%', bottom: '18%', top: '5%', containLabel: true },
    dataZoom: [{ type: 'slider', start: 0, end: 100, height: 20 }],
    xAxis: {
      type: 'category',
      data: stats.byOperator.map(o => o.nomUti.split(' ').slice(-2).join(' ')),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: { type: 'value', name: 'Minutos (>5 min)', nameLocation: 'middle', nameGap: 50 },
    series: [{
      type: 'bar',
      data: stats.byOperator.map(o => o.totalMin),
      itemStyle: {
        color: (params: unknown) => {
          const p = params as { dataIndex: number };
          const op = stats.byOperator[p.dataIndex];
          return op && op.totalMin > 30 ? '#ef4444' : op && op.totalMin > 15 ? '#f97316' : '#eab308';
        },
        borderRadius: [4, 4, 0, 0],
      },
    }],
  } : {};

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
            <Button size="sm" onClick={() => { fetchStats(); fetchMovements(movPage); }} disabled={loading || movLoading}
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
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg bg-red-500 p-2"><Clock className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Tiempo Muerto Total</p>
                      <p className="text-lg sm:text-2xl font-bold">{fmtDur(stats.kpis.totalDeadTime)}</p>
                      <p className="text-[10px] text-muted-foreground">{stats.kpis.deadTimeEvents} eventos (&gt;5 min)</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg bg-amber-500 p-2"><TrendingUp className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Promedio de Gap</p>
                      <p className="text-lg sm:text-2xl font-bold">{stats.kpis.avgGap}s</p>
                      <p className="text-[10px] text-muted-foreground">entre escaneos consecutivos</p>
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

            {/* Summary box + Chart */}
            {stats && !loading && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Summary */}
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowDown className="h-4 w-4 text-red-500" />
                      <h3 className="text-sm font-semibold text-red-700">Resumen de Tiempos Muertos</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Umbral considerado:</span>
                        <span className="font-semibold">&gt; 5 minutos</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Eventos encontrados:</span>
                        <span className="font-bold text-red-600">{stats.kpis.deadTimeEvents}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between">
                        <span className="font-medium">Suma total:</span>
                        <span className="font-bold text-red-600 text-base">{fmtDur(stats.kpis.totalDeadTime)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>≈ {Math.round(stats.kpis.totalDeadTime / 60)} minutos</span>
                        <span>≈ {(stats.kpis.totalDeadTime / 3600).toFixed(1)} horas</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Chart */}
                <Card className="lg:col-span-2">
                  <CardContent className="p-2 sm:p-4">
                    <p className="text-xs font-semibold mb-1 px-2 pt-2">Tiempos Muertos por Operador (&gt;5 min)</p>
                    <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: '300px', width: '100%' }} notMerge />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Movements Table */}
            {movSummary && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Todos los Movimientos</h3>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{movTotal.toLocaleString('es-AR')} registros</span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-400"></span>
                        Tiempo muerto (&gt;5 min): <b className="text-red-600">{movSummary.deadTimeCount}</b> eventos — <b className="text-red-600">{movSummary.totalDeadTimeFormatted}</b>
                      </span>
                    </div>
                  </div>

                  {movLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Cargando movimientos...</span>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-10">#</TableHead>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs">Hora</TableHead>
                              <TableHead className="text-xs">Zona</TableHead>
                              <TableHead className="text-xs">Activ.</TableHead>
                              <TableHead className="text-xs">Producto</TableHead>
                              <TableHead className="text-xs">Bultos</TableHead>
                              <TableHead className="text-xs text-right">Gap</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {movements.map((row, i) => (
                              <TableRow
                                key={row.id}
                                className={row.isDeadTime ? 'bg-red-50 hover:bg-red-100/70' : ''}
                              >
                                <TableCell className="text-[10px] text-muted-foreground font-mono">
                                  {(movPage - 1) * 200 + i + 1}
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs font-medium leading-tight">{row.nomUti}</div>
                                  <div className="text-[10px] text-muted-foreground">{row.codUti}</div>
                                </TableCell>
                                <TableCell className="text-xs">{row.fecha}</TableCell>
                                <TableCell className="text-xs font-mono">{row.hora}</TableCell>
                                <TableCell className="text-xs">{row.zonSts || '—'}</TableCell>
                                <TableCell className="text-xs">{row.codAct}</TableCell>
                                <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[120px] truncate">{row.codPro}</TableCell>
                                <TableCell className="text-xs text-center">{row.bultos}</TableCell>
                                <TableCell className="text-right">
                                  {row.gapSeconds !== null ? (
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                      row.isDeadTime
                                        ? 'bg-red-500 text-white'
                                        : 'text-muted-foreground'
                                    }`}>
                                      {fmtGap(row.gapSeconds)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/50">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <span className="text-xs text-muted-foreground">
                          Página {movPage} de {movTotalPages}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={movPage <= 1}
                            onClick={() => fetchMovements(movPage - 1)}>
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <span className="text-xs px-2">{movPage} / {movTotalPages}</span>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={movPage >= movTotalPages}
                            onClick={() => fetchMovements(movPage + 1)}>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
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
            Umbral: &gt;5 min = tiempo muerto — Next.js + SQLite + ECharts
          </p>
        </div>
      </footer>
    </div>
  );
}