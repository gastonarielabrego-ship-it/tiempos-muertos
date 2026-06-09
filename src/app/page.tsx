'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, PieChart, LineChart, HeatmapChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, TitleComponent,
  LegendComponent, DataZoomComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Upload, RefreshCw, Clock, Users, Activity, AlertTriangle,
  TrendingUp, Zap, BarChart3, Filter, FileSpreadsheet, Loader2,
  Database, Timer, ChevronUp, ChevronDown, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

echarts.use([
  BarChart, PieChart, LineChart, HeatmapChart,
  GridComponent, TooltipComponent, TitleComponent,
  LegendComponent, DataZoomComponent, VisualMapComponent,
  CanvasRenderer,
]);

// --- Types ---
interface KPIs {
  totalScans: number;
  totalDeadTime: number;
  avgDeadTime: number;
  maxDeadTime: number;
  operatorsCount: number;
}

interface OperatorStat {
  codUti: string;
  nomUti: string;
  totalMin: number;
  avgSec: number;
  maxSec: number;
  gaps: number;
}

interface RangeStat {
  label: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

interface HourStat {
  hour: number;
  label: string;
  avgSec: number;
  count: number;
  totalMin: number;
}

interface ZoneStat {
  zone: string;
  totalMin: number;
  avgSec: number;
  count: number;
}

interface ActivityStat {
  activity: number;
  totalMin: number;
  avgSec: number;
  count: number;
}

interface TopGap {
  nomUti: string;
  codUti: string;
  fecha: string;
  prevHora: string;
  hora: string;
  gapSeconds: number;
  gapFormatted: string;
  zona: string | null;
}

interface Filters {
  dates: string[];
  operators: { codUti: string; nomUti: string }[];
  zones: string[];
  activities: number[];
  totalRecords: number;
}

interface StatsData {
  kpis: KPIs;
  byOperator: OperatorStat[];
  byRange: RangeStat[];
  byHour: HourStat[];
  byZone: ZoneStat[];
  byActivity: ActivityStat[];
  topGaps: TopGap[];
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// --- KPI Card Component ---
function KPICard({
  title, value, subtitle, icon: Icon, color, subValue,
}: {
  title: string; value: string; subtitle: string;
  icon: React.ElementType; color: string; subValue?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-xl sm:text-3xl font-bold tracking-tight">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
            <p className="text-xs text-muted-foreground/70">{subtitle}</p>
          </div>
          <div className={`rounded-lg p-2 sm:p-3 ${color}`}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main Page ---
export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<string>('all');
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [selectedAct, setSelectedAct] = useState<string>('all');
  const [hasData, setHasData] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchFilters = useCallback(async () => {
    try {
      const res = await fetch('/api/records');
      if (!res.ok) throw new Error();
      const data: Filters = await res.json();
      setFilters(data);
      if (data.totalRecords === 0) setHasData(false);
      else setHasData(true);
    } catch {
      console.error('Error fetching filters');
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOp !== 'all') params.set('operator', selectedOp);
      if (selectedZone !== 'all') params.set('zone', selectedZone);
      if (selectedAct !== 'all') params.set('activity', selectedAct);
      const res = await fetch(`/api/stats?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data: StatsData = await res.json();
      setStats(data);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar las estadísticas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOp, selectedZone, selectedAct, toast]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    if (hasData) fetchStats();
    else setLoading(false);
  }, [fetchStats, hasData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: 'Datos actualizados', description: data.message || `${data.totalRecords} registros cargados` });
      setHasData(true);
      setSelectedOp('all');
      setSelectedZone('all');
      setSelectedAct('all');
      await fetchFilters();
    } catch (err) {
      toast({
        title: 'Error al cargar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const activeFilters = (selectedOp !== 'all' ? 1 : 0) + (selectedZone !== 'all' ? 1 : 0) + (selectedAct !== 'all' ? 1 : 0);

  // --- ECharts Options ---
  const operatorBarOption: echarts.EChartsOption = stats ? {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '8%', containLabel: true },
    dataZoom: [{ type: 'slider', start: 0, end: 100, height: 20 }],
    xAxis: {
      type: 'category',
      data: stats.byOperator.map(o => o.nomUti.split(' ').slice(-2).join(' ')),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: { type: 'value', name: 'Minutos', nameLocation: 'middle', nameGap: 45 },
    series: [
      {
        name: 'Tiempo Muerto Total',
        type: 'bar',
        data: stats.byOperator.map(o => o.totalMin),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#f97316' },
            { offset: 1, color: '#fb923c' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        emphasis: { itemStyle: { color: '#ea580c' } },
      },
      {
        name: 'Promedio (s)',
        type: 'bar',
        data: stats.byOperator.map(o => o.avgSec),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#38bdf8' },
            { offset: 1, color: '#7dd3fc' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
    legend: { data: ['Tiempo Muerto Total', 'Promedio (s)'], bottom: 0 },
  } : {};

  const rangePieOption: echarts.EChartsOption = stats ? {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', right: '5%', top: 'center', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
      data: stats.byRange.map((r, i) => ({
        name: r.label,
        value: r.count,
        itemStyle: {
          color: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#dc2626', '#991b1b', '#7f1d1d'][i],
        },
      })),
    }],
  } : {};

  const hourLineOption: echarts.EChartsOption = stats ? {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '12%', containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.byHour.map(h => h.label),
      axisLabel: { fontSize: 10 },
    },
    yAxis: [
      { type: 'value', name: 'Promedio (s)', position: 'left' },
      { type: 'value', name: 'Total (min)', position: 'right' },
    ],
    series: [
      {
        name: 'Promedio (s)',
        type: 'line',
        data: stats.byHour.map(h => h.avgSec),
        smooth: true,
        lineStyle: { width: 3, color: '#f97316' },
        itemStyle: { color: '#f97316' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(249,115,22,0.3)' },
            { offset: 1, color: 'rgba(249,115,22,0.02)' },
          ]),
        },
      },
      {
        name: 'Total (min)',
        type: 'bar',
        yAxisIndex: 1,
        data: stats.byHour.map(h => h.totalMin),
        itemStyle: { color: 'rgba(56,189,248,0.4)', borderRadius: [3, 3, 0, 0] },
        barWidth: '40%',
      },
    ],
    legend: { data: ['Promedio (s)', 'Total (min)'], bottom: 0 },
  } : {};

  const zoneBarOption: echarts.EChartsOption = stats ? {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.byZone.map(z => `Zona ${z.zone}`),
    },
    yAxis: { type: 'value', name: 'Minutos' },
    series: [{
      type: 'bar',
      data: stats.byZone.map((z, i) => ({
        value: z.totalMin,
        itemStyle: {
          color: ['#22c55e', '#38bdf8', '#f97316', '#a855f7', '#ef4444', '#eab308', '#6366f1'][i % 7],
          borderRadius: [4, 4, 0, 0],
        },
      })),
    }],
  } : {};

  const activityBarOption: echarts.EChartsOption = stats ? {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.byActivity.map(a => `Actividad ${a.activity}`),
    },
    yAxis: { type: 'value', name: 'Minutos' },
    series: [{
      type: 'bar',
      data: stats.byActivity.map(a => a.totalMin),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#a855f7' },
          { offset: 1, color: '#c084fc' },
        ]),
        borderRadius: [4, 4, 0, 0],
      },
    }],
  } : {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500">
              <Timer className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">Tiempos Muertos Operativos</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Análisis de eficiencia operativa en tiempo real</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{uploading ? 'Cargando...' : 'Cargar Excel'}</span>
            </Button>
            <Button
              size="sm"
              onClick={fetchStats}
              disabled={loading}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        {!hasData ? (
          <Card className="mt-10">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Database className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Sin datos cargados</h2>
              <p className="text-muted-foreground text-center mb-6 max-w-md">
                Carga un archivo Excel con los datos operativos para comenzar el análisis de tiempos muertos.
              </p>
              <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Cargar primer archivo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Filters */}
            <Card className="mb-4 sm:mb-6">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    Filtros
                    {activeFilters > 0 && (
                      <Badge variant="secondary" className="ml-1">{activeFilters}</Badge>
                    )}
                  </div>
                  <Select value={selectedOp} onValueChange={setSelectedOp}>
                    <SelectTrigger className="w-full sm:w-[220px] h-8 text-xs">
                      <SelectValue placeholder="Operador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los operadores</SelectItem>
                      {filters?.operators.map(o => (
                        <SelectItem key={o.codUti} value={o.codUti}>{o.nomUti}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedZone} onValueChange={setSelectedZone}>
                    <SelectTrigger className="w-full sm:w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Zona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las zonas</SelectItem>
                      {filters?.zones.map(z => (
                        <SelectItem key={z} value={z}>Zona {z}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedAct} onValueChange={setSelectedAct}>
                    <SelectTrigger className="w-full sm:w-[150px] h-8 text-xs">
                      <SelectValue placeholder="Actividad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las actividades</SelectItem>
                      {filters?.activities.map(a => (
                        <SelectItem key={a} value={String(a)}>Actividad {a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeFilters > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedOp('all'); setSelectedZone('all'); setSelectedAct('all'); }}
                      className="h-8 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" /> Limpiar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            {stats && (
              <div className="mb-4 sm:mb-6 grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                <KPICard
                  title="Total Escaneos"
                  value={stats.kpis.totalScans.toLocaleString('es-AR')}
                  subtitle="Registros procesados"
                  icon={BarChart3}
                  color="bg-blue-500"
                />
                <KPICard
                  title="Tiempo Muerto Total"
                  value={formatDuration(stats.kpis.totalDeadTime)}
                  subValue={`≈ ${Math.round(stats.kpis.totalDeadTime / 60)} minutos`}
                  subtitle="Suma de todos los gaps"
                  icon={Clock}
                  color="bg-orange-500"
                />
                <KPICard
                  title="Promedio de Gap"
                  value={`${stats.kpis.avgDeadTime}s`}
                  subtitle="Entre escaneos consecutivos"
                  icon={TrendingUp}
                  color="bg-emerald-500"
                />
                <KPICard
                  title="Gap Máximo"
                  value={formatDuration(stats.kpis.maxDeadTime)}
                  subtitle="Mayor tiempo sin actividad"
                  icon={AlertTriangle}
                  color="bg-red-500"
                />
                <KPICard
                  title="Operadores"
                  value={String(stats.kpis.operatorsCount)}
                  subValue={`${stats.byOperator.length > 0 ? Math.round(stats.byOperator[0].totalMin) : 0} min máx.`}
                  subtitle="Activos en el período"
                  icon={Users}
                  color="bg-purple-500"
                />
              </div>
            )}

            {loading && !stats ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Calculando estadísticas...</span>
              </div>
            ) : stats ? (
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid lg:grid-cols-3">
                  <TabsTrigger value="overview">Vista General</TabsTrigger>
                  <TabsTrigger value="operators">Por Operador</TabsTrigger>
                  <TabsTrigger value="details">Detalle de Gaps</TabsTrigger>
                </TabsList>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Tiempos Muertos por Operador (Top 20)</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2 sm:p-4">
                        <ReactEChartsCore
                          echarts={echarts}
                          option={operatorBarOption}
                          style={{ height: '380px', width: '100%' }}
                          notMerge
                        />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Distribución por Rango de Tiempo</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2 sm:p-4">
                        <ReactEChartsCore
                          echarts={echarts}
                          option={rangePieOption}
                          style={{ height: '380px', width: '100%' }}
                          notMerge
                        />
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Evolución por Hora del Día</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 sm:p-4">
                      <ReactEChartsCore
                        echarts={echarts}
                        option={hourLineOption}
                        style={{ height: '350px', width: '100%' }}
                        notMerge
                      />
                    </CardContent>
                  </Card>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Tiempos Muertos por Zona</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2 sm:p-4">
                        <ReactEChartsCore
                          echarts={echarts}
                          option={zoneBarOption}
                          style={{ height: '300px', width: '100%' }}
                          notMerge
                        />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Tiempos Muertos por Actividad</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2 sm:p-4">
                        <ReactEChartsCore
                          echarts={echarts}
                          option={activityBarOption}
                          style={{ height: '300px', width: '100%' }}
                          notMerge
                        />
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* OPERATORS TAB */}
                <TabsContent value="operators">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">
                        Ranking de Operadores por Tiempo Muerto
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[600px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10 text-xs">#</TableHead>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs text-right">Tiempo Total</TableHead>
                              <TableHead className="text-xs text-right">Promedio/Gap</TableHead>
                              <TableHead className="text-xs text-right">Máximo</TableHead>
                              <TableHead className="text-xs text-right">Gaps</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.byOperator.map((op, i) => (
                              <TableRow key={op.codUti}>
                                <TableCell className="text-xs font-mono text-muted-foreground">
                                  {i + 1}
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs font-medium">{op.nomUti}</div>
                                  <div className="text-[10px] text-muted-foreground">{op.codUti}</div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant={op.totalMin > 400 ? 'destructive' : op.totalMin > 300 ? 'secondary' : 'outline'} className="text-xs">
                                    {op.totalMin} min
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-xs">{op.avgSec}s</TableCell>
                                <TableCell className="text-right text-xs">{formatDuration(op.maxSec)}</TableCell>
                                <TableCell className="text-right text-xs">{op.gaps}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* DETAILS TAB */}
                <TabsContent value="details">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">
                        Mayores Tiempos Muertos (Top 50)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[600px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10 text-xs">#</TableHead>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs">Desde</TableHead>
                              <TableHead className="text-xs">Hasta</TableHead>
                              <TableHead className="text-xs text-right">Duración</TableHead>
                              <TableHead className="text-xs">Zona</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.topGaps.map((gap, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono text-muted-foreground">
                                  {i + 1}
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs font-medium">{gap.nomUti}</div>
                                </TableCell>
                                <TableCell className="text-xs">{gap.fecha}</TableCell>
                                <TableCell className="text-xs font-mono">{gap.prevHora}</TableCell>
                                <TableCell className="text-xs font-mono">{gap.hora}</TableCell>
                                <TableCell className="text-right">
                                  <Badge
                                    variant={gap.gapSeconds > 600 ? 'destructive' : gap.gapSeconds > 120 ? 'secondary' : 'outline'}
                                    className="text-xs"
                                  >
                                    {gap.gapFormatted}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{gap.zona ? `Zona ${gap.zona}` : '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : null}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white/60 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <p className="text-center text-xs text-muted-foreground">
            Tiempos Muertos Operativos — Stack gratuito: Next.js + SQLite + ECharts — Listo para migrar a GitHub
          </p>
        </div>
      </footer>
    </div>
  );
}