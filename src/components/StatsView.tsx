import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, PieChart, LineChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendPlainComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType, EChartsCoreOption } from 'echarts/core';

echarts.use([
  BarChart,
  PieChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendPlainComponent,
  CanvasRenderer,
]);

import {
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calculator,
  Store,
  Tag,
  Hash,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Receipt,
  Camera,
  RotateCcw,
  Calendar,
  PieChart as PieChartIcon,
  BarChart3,
  Layers,
  Activity,
} from 'lucide-react';
import { ShoppingItem, FinancialMetrics, PurchaseReceipt } from '../types';
import { calculateDetailedAnalytics } from '../utils/analytics';
import { formatMoney, formatNumber, parseLocaleNumber } from '../utils/formatters';

interface StatsViewProps {
  items: ShoppingItem[];
  budget: number;
  onBudgetChange: (budget: number) => void;
  metrics: FinancialMetrics;
  onResetAllCompleted: () => void;
  onResetItem?: (id: string) => void;
  onToggleCompleted?: (id: string) => void;
  receipts?: PurchaseReceipt[];
  onOpenReceiptScanner?: () => void;
  onDeleteReceipt?: (receiptId: string) => void;
  theme: 'light' | 'dark';
}

export const StatsView: React.FC<StatsViewProps> = ({
  items,
  budget,
  onBudgetChange,
  onResetAllCompleted,
  onResetItem,
  onToggleCompleted,
  receipts = [],
  onOpenReceiptScanner,
  onDeleteReceipt,
  theme,
}) => {
  // Interactive chart controls
  const [groupBy, setGroupBy] = useState<'store' | 'category'>('store');
  const [metricType, setMetricType] = useState<'currency' | 'units' | 'products'>('currency');
  const [paretoGroupBy, setParetoGroupBy] = useState<'store' | 'category'>('store');
  const [variationFilter, setVariationFilter] = useState<'all' | 'up' | 'down'>('all');

  // Product ranking & audit table controls & collapsible state
  const [isRankingCollapsed, setIsRankingCollapsed] = useState(false);
  const [isStoreTableCollapsed, setIsStoreTableCollapsed] = useState(false);
  const [isReceiptsSectionCollapsed, setIsReceiptsSectionCollapsed] = useState(false);
  const [expandedReceiptIds, setExpandedReceiptIds] = useState<Record<string, boolean>>({});
  const [rankingFilter, setRankingFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [rankingSort, setRankingSort] = useState<'cost_desc' | 'sku_asc'>('cost_desc');

  // Budget text input state so user can type with . or , smoothly
  const [budgetText, setBudgetText] = useState<string>(() =>
    budget > 0 ? formatNumber(budget, 2) : ''
  );
  const [isEditingBudget, setIsEditingBudget] = useState(false);

  useEffect(() => {
    if (!isEditingBudget) {
      setBudgetText(budget > 0 ? formatNumber(budget, 2) : '');
    }
  }, [budget, isEditingBudget]);

  // ECharts refs
  const mainChartRef = useRef<HTMLDivElement | null>(null);
  const mainChartInstance = useRef<EChartsType | null>(null);
  const mainThemeRef = useRef<'light' | 'dark'>(theme);

  const donutChartRef = useRef<HTMLDivElement | null>(null);
  const donutChartInstance = useRef<EChartsType | null>(null);
  const donutThemeRef = useRef<'light' | 'dark'>(theme);

  const paretoChartRef = useRef<HTMLDivElement | null>(null);
  const paretoChartInstance = useRef<EChartsType | null>(null);
  const paretoThemeRef = useRef<'light' | 'dark'>(theme);

  const efficiencyChartRef = useRef<HTMLDivElement | null>(null);
  const efficiencyChartInstance = useRef<EChartsType | null>(null);
  const efficiencyThemeRef = useRef<'light' | 'dark'>(theme);

  const ticketHistoryChartRef = useRef<HTMLDivElement | null>(null);
  const ticketHistoryChartInstance = useRef<EChartsType | null>(null);
  const ticketHistoryThemeRef = useRef<'light' | 'dark'>(theme);

  const analytics = useMemo(
    () => calculateDetailedAnalytics(items, budget, receipts),
    [items, budget, receipts]
  );

  // 1. Render Main Bar Chart (Store or Category | $ or Units or #ID | Spent vs Pending)
  useEffect(() => {
    if (!mainChartRef.current) return;

    if (!mainChartInstance.current || mainThemeRef.current !== theme) {
      if (mainChartInstance.current) {
        mainChartInstance.current.dispose();
      }
      mainChartInstance.current = echarts.init(
        mainChartRef.current,
        theme === 'dark' ? 'dark' : undefined
      );
      mainThemeRef.current = theme;
    }

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const sourceData =
      groupBy === 'store' ? analytics.storeBreakdown : analytics.categoryBreakdown;

    if (sourceData.length === 0) {
      mainChartInstance.current.setOption(
        {
          backgroundColor: 'transparent',
          title: {
            text: 'Agrega productos a tu lista para visualizar el análisis comparativo',
            left: 'center',
            top: 'center',
            textStyle: {
              color: mutedColor,
              fontSize: 14,
              fontWeight: 'normal',
            },
          },
          series: [],
        },
        true
      );
      return;
    }

    const labels = sourceData.map((d) => d.name);
    const pendingSeriesData = sourceData.map((d) =>
      metricType === 'currency'
        ? d.pendingAmount
        : metricType === 'units'
        ? d.pendingUnits
        : d.pendingProductCount
    );
    const spentSeriesData = sourceData.map((d) =>
      metricType === 'currency'
        ? d.spentAmount
        : metricType === 'units'
        ? d.spentUnits
        : d.completedProductCount
    );

    const unitSuffix =
      metricType === 'currency' ? '' : metricType === 'units' ? ' un.' : ' prod.';

    const option: EChartsCoreOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const groupName = params[0].axisValueLabel;
          let totalVal = 0;
          const lines = params.map((p: any) => {
            const val = Number(p.value) || 0;
            totalVal += val;
            const formatted =
              metricType === 'currency'
                ? formatMoney(val)
                : `${formatNumber(val)}${unitSuffix}`;
            return `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:4px;">
              <span>${p.marker} ${p.seriesName}</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatted}</strong>
            </div>`;
          });
          const totalFormatted =
            metricType === 'currency'
              ? formatMoney(totalVal)
              : `${formatNumber(totalVal)}${unitSuffix}`;
          return `<div style="min-width:185px;">
            <div style="font-weight:800;margin-bottom:4px;border-bottom:1px solid rgba(148,163,184,0.3);padding-bottom:3px;">${groupName}</div>
            ${lines.join('')}
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:6px;padding-top:4px;border-top:1px dashed rgba(148,163,184,0.3);">
              <span>Total</span>
              <strong style="font-variant-numeric:tabular-nums;">${totalFormatted}</strong>
            </div>
          </div>`;
        },
      },
      legend: {
        data: ['Pendiente por comprar', 'Gastado real (Comprado)'],
        textStyle: { color: textColor, fontWeight: 600 },
        top: 0,
      },
      grid: {
        left: '1.5%',
        right: '2.5%',
        bottom: '8%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor,
          interval: 0,
          rotate: labels.length > 7 ? 22 : 0,
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
        axisLabel: {
          color: textColor,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          formatter: (val: number) =>
            metricType === 'currency'
              ? `$${formatNumber(val, 0)}`
              : `${formatNumber(val)}${unitSuffix}`,
        },
      },
      series: [
        {
          name: 'Pendiente por comprar',
          type: 'bar',
          stack: 'total',
          barMaxWidth: 44,
          emphasis: { focus: 'series' },
          itemStyle: {
            color: isDark ? '#3b82f6' : '#1d4ed8',
            borderRadius: [0, 0, 0, 0],
          },
          data: pendingSeriesData,
        },
        {
          name: 'Gastado real (Comprado)',
          type: 'bar',
          stack: 'total',
          barMaxWidth: 44,
          emphasis: { focus: 'series' },
          itemStyle: {
            color: isDark ? '#10b981' : '#047857',
            borderRadius: [4, 4, 0, 0],
          },
          data: spentSeriesData,
        },
      ],
    };

    mainChartInstance.current.setOption(option, true);
  }, [analytics, groupBy, metricType, theme]);

  // 2. Render Secondary Donut Chart (Budget vs Committed & Completion)
  useEffect(() => {
    if (!donutChartRef.current) return;

    if (!donutChartInstance.current || donutThemeRef.current !== theme) {
      if (donutChartInstance.current) {
        donutChartInstance.current.dispose();
      }
      donutChartInstance.current = echarts.init(
        donutChartRef.current,
        theme === 'dark' ? 'dark' : undefined
      );
      donutThemeRef.current = theme;
    }

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';

    const hasSpend = analytics.totalOverall > 0 || analytics.budget > 0;
    if (!hasSpend && analytics.totalProducts === 0) {
      donutChartInstance.current.setOption(
        {
          backgroundColor: 'transparent',
          title: {
            text: 'Sin datos financieros',
            left: 'center',
            top: 'center',
            textStyle: { color: mutedColor, fontSize: 13, fontWeight: 'normal' },
          },
          series: [],
        },
        true
      );
      return;
    }

    const donutData: Array<{ value: number; name: string; itemStyle: { color: string } }> = [];

    if (analytics.totalOverall > 0 || analytics.budget > 0) {
      donutData.push({
        value: analytics.totalSpent,
        name: 'Gastado Real ($)',
        itemStyle: { color: isDark ? '#10b981' : '#047857' },
      });
      donutData.push({
        value: analytics.totalPending,
        name: 'Pendiente ($)',
        itemStyle: { color: isDark ? '#3b82f6' : '#1d4ed8' },
      });
      if (analytics.budget > analytics.totalOverall) {
        donutData.push({
          value: Math.max(0, Math.round((analytics.budget - analytics.totalOverall) * 100) / 100),
          name: 'Presupuesto Libre ($)',
          itemStyle: { color: isDark ? '#1e293b' : '#cbd5e1' },
        });
      }
    } else {
      donutData.push({
        value: analytics.completedProducts,
        name: 'Comprados (#ID)',
        itemStyle: { color: isDark ? '#10b981' : '#047857' },
      });
      donutData.push({
        value: analytics.pendingProducts,
        name: 'Pendientes (#ID)',
        itemStyle: { color: isDark ? '#3b82f6' : '#1d4ed8' },
      });
    }

    const option: EChartsCoreOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const isMoney = String(p.name).includes('$');
          const valStr = isMoney ? formatMoney(p.value) : `${formatNumber(p.value, 0)} art.`;
          return `<strong>${p.name}</strong><br/><span style="font-family:'JetBrains Mono',monospace;">${valStr} (${formatNumber(p.percent, 1)}%)</span>`;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: textColor, fontSize: 11 },
      },
      series: [
        {
          name: 'Balance de Compra',
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: isDark ? '#111827' : '#ffffff',
            borderWidth: 2,
          },
          label: {
            show: true,
            position: 'center',
            formatter: () =>
              analytics.totalOverall > 0
                ? `$${formatNumber(analytics.totalOverall, 0)}\nTotal Carrito`
                : `${formatNumber(analytics.completionRateProducts, 1)}%\nCompletado`,
            color: textColor,
            fontSize: 13,
            fontWeight: 'bold',
            lineHeight: 18,
          },
          data: donutData,
        },
      ],
    };

    donutChartInstance.current.setOption(option, true);
  }, [analytics, theme]);

  // 3. Render Pareto 80-20 Curve Chart (Store or Category Concentration)
  useEffect(() => {
    if (!paretoChartRef.current) return;

    if (!paretoChartInstance.current || paretoThemeRef.current !== theme) {
      if (paretoChartInstance.current) {
        paretoChartInstance.current.dispose();
      }
      paretoChartInstance.current = echarts.init(
        paretoChartRef.current,
        theme === 'dark' ? 'dark' : undefined
      );
      paretoThemeRef.current = theme;
    }

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const paretoData =
      paretoGroupBy === 'store' ? analytics.paretoStores : analytics.paretoCategories;

    if (paretoData.length === 0) {
      paretoChartInstance.current.setOption(
        {
          backgroundColor: 'transparent',
          title: {
            text: 'Sin datos para calcular Curva de Pareto 80/20',
            left: 'center',
            top: 'center',
            textStyle: { color: mutedColor, fontSize: 13, fontWeight: 'normal' },
          },
          series: [],
        },
        true
      );
      return;
    }

    const labels = paretoData.map((d) => d.name);
    const barValues = paretoData.map((d) => ({
      value: d.totalAmount,
      itemStyle: {
        color:
          d.paretoClass === 'A'
            ? isDark
              ? '#3b82f6'
              : '#1d4ed8'
            : d.paretoClass === 'B'
            ? isDark
              ? '#38bdf8'
              : '#0284c7'
            : isDark
            ? '#64748b'
            : '#94a3b8',
        borderRadius: [4, 4, 0, 0],
      },
    }));
    const cumLineValues = paretoData.map((d) => d.cumulativePercent);
    const cutoff80Line = paretoData.map(() => 80);

    const option: EChartsCoreOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const idx = params[0].dataIndex;
          const node = paretoData[idx];
          if (!node) return '';
          return `<div style="min-width:195px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:800;margin-bottom:5px;border-bottom:1px solid rgba(148,163,184,0.3);padding-bottom:4px;">
              <span>${node.name}</span>
              <span style="font-size:11px;padding:1px 6px;border-radius:4px;background:${
                node.paretoClass === 'A'
                  ? 'rgba(29,78,216,0.2)'
                  : node.paretoClass === 'B'
                  ? 'rgba(2,132,199,0.2)'
                  : 'rgba(100,116,139,0.2)'
              };">Clase ${node.paretoClass}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Monto Total:</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatMoney(node.totalAmount)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Peso Individual:</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatNumber(node.sharePercent, 1)}%</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>% Acumulado Pareto:</span>
              <strong style="color:#d97706;font-variant-numeric:tabular-nums;">${formatNumber(node.cumulativePercent, 1)}%</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;font-size:11.5px;color:#94a3b8;">
              <span>Artículos:</span>
              <span>${formatNumber(node.productCount, 0)} prod.</span>
            </div>
          </div>`;
        },
      },
      legend: {
        data: ['Volumen de Gasto ($)', '% Acumulado Pareto', 'Umbral 80% (Clase A)'],
        textStyle: { color: textColor, fontSize: 11, fontWeight: 600 },
        top: 0,
      },
      grid: {
        left: '2%',
        right: '3%',
        bottom: '8%',
        top: '16%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor,
          interval: 0,
          rotate: labels.length > 5 ? 22 : 0,
          fontSize: 11,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Monto ($)',
          nameTextStyle: { color: mutedColor, fontSize: 10 },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
          axisLabel: {
            color: textColor,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5,
            formatter: (val: number) => `$${formatNumber(val, 0)}`,
          },
        },
        {
          type: 'value',
          name: '% Acum.',
          min: 0,
          max: 100,
          nameTextStyle: { color: mutedColor, fontSize: 10 },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { show: false },
          axisLabel: {
            color: '#d97706',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5,
            formatter: (val: number) => `${val}%`,
          },
        },
      ],
      series: [
        {
          name: 'Volumen de Gasto ($)',
          type: 'bar',
          yAxisIndex: 0,
          barMaxWidth: 38,
          data: barValues,
        },
        {
          name: '% Acumulado Pareto',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color: '#d97706', width: 3 },
          itemStyle: { color: '#d97706' },
          data: cumLineValues,
        },
        {
          name: 'Umbral 80% (Clase A)',
          type: 'line',
          yAxisIndex: 1,
          symbol: 'none',
          lineStyle: { color: '#dc2626', width: 1.5, type: 'dashed' },
          itemStyle: { color: '#dc2626' },
          data: cutoff80Line,
        },
      ],
    };

    paretoChartInstance.current.setOption(option, true);
  }, [analytics, paretoGroupBy, theme]);

  // 4. Render Store Efficiency Matrix Chart (Avg Cost per Product vs Item Count & Spend Share)
  useEffect(() => {
    if (!efficiencyChartRef.current) return;

    if (!efficiencyChartInstance.current || efficiencyThemeRef.current !== theme) {
      if (efficiencyChartInstance.current) {
        efficiencyChartInstance.current.dispose();
      }
      efficiencyChartInstance.current = echarts.init(
        efficiencyChartRef.current,
        theme === 'dark' ? 'dark' : undefined
      );
      efficiencyThemeRef.current = theme;
    }

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const matrix = analytics.storeEfficiencyMatrix;

    if (matrix.length === 0) {
      efficiencyChartInstance.current.setOption(
        {
          backgroundColor: 'transparent',
          title: {
            text: 'Sin comercios registrados para la Matriz de Eficiencia',
            left: 'center',
            top: 'center',
            textStyle: { color: mutedColor, fontSize: 13, fontWeight: 'normal' },
          },
          series: [],
        },
        true
      );
      return;
    }

    const labels = matrix.map((m) => m.name);
    const avgCostData = matrix.map((m) => m.avgCostPerProduct);
    const itemCountData = matrix.map((m) => m.productCount);

    const option: EChartsCoreOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const idx = params[0].dataIndex;
          const st = matrix[idx];
          if (!st) return '';
          return `<div style="min-width:205px;">
            <div style="font-weight:800;margin-bottom:5px;border-bottom:1px solid rgba(148,163,184,0.3);padding-bottom:4px;">
              ${st.name} (Clase ${st.paretoClass})
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Costo Prom. / Producto:</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatMoney(st.avgCostPerProduct)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Costo Prom. / Unidad:</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatMoney(st.avgCostPerUnit)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Cantidad de #IDs:</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatNumber(st.productCount, 0)} prod. (${formatNumber(st.totalUnits)} un.)</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Presupuesto Total Local:</span>
              <strong style="color:#3b82f6;font-variant-numeric:tabular-nums;">${formatMoney(st.totalAmount)} (${formatNumber(st.shareOfTotalSpend, 1)}%)</strong>
            </div>
          </div>`;
        },
      },
      legend: {
        data: ['Costo Promedio por #ID ($)', 'Cantidad de Productos (#ID)'],
        textStyle: { color: textColor, fontSize: 11, fontWeight: 600 },
        top: 0,
      },
      grid: {
        left: '2%',
        right: '3%',
        bottom: '8%',
        top: '16%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor,
          interval: 0,
          rotate: labels.length > 5 ? 22 : 0,
          fontSize: 11,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Prom. ($)',
          nameTextStyle: { color: mutedColor, fontSize: 10 },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
          axisLabel: {
            color: textColor,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5,
            formatter: (val: number) => `$${formatNumber(val, 0)}`,
          },
        },
        {
          type: 'value',
          name: 'Cant. #IDs',
          nameTextStyle: { color: mutedColor, fontSize: 10 },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { show: false },
          axisLabel: {
            color: isDark ? '#34d399' : '#047857',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5,
            formatter: (val: number) => `${formatNumber(val, 0)}`,
          },
        },
      ],
      series: [
        {
          name: 'Costo Promedio por #ID ($)',
          type: 'bar',
          yAxisIndex: 0,
          barMaxWidth: 36,
          itemStyle: {
            color: isDark ? '#38bdf8' : '#0284c7',
            borderRadius: [4, 4, 0, 0],
          },
          data: avgCostData,
        },
        {
          name: 'Cantidad de Productos (#ID)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'diamond',
          symbolSize: 8,
          lineStyle: { color: isDark ? '#34d399' : '#047857', width: 2.5 },
          itemStyle: { color: isDark ? '#34d399' : '#047857' },
          data: itemCountData,
        },
      ],
    };

    efficiencyChartInstance.current.setOption(option, true);
  }, [analytics, theme]);

  // 5. Render Historical Tickets & Chronological Spend Chart
  useEffect(() => {
    if (!ticketHistoryChartRef.current) return;

    if (!ticketHistoryChartInstance.current || ticketHistoryThemeRef.current !== theme) {
      if (ticketHistoryChartInstance.current) {
        ticketHistoryChartInstance.current.dispose();
      }
      ticketHistoryChartInstance.current = echarts.init(
        ticketHistoryChartRef.current,
        theme === 'dark' ? 'dark' : undefined
      );
      ticketHistoryThemeRef.current = theme;
    }

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const series = analytics.ticketHistorySeries;

    if (series.length === 0) {
      ticketHistoryChartInstance.current.setOption(
        {
          backgroundColor: 'transparent',
          title: {
            text: 'Marca productos como comprados o sube un ticket para ver la evolución histórica por fecha',
            left: 'center',
            top: 'center',
            textStyle: { color: mutedColor, fontSize: 12.5, fontWeight: 'normal' },
          },
          series: [],
        },
        true
      );
      return;
    }

    const dates = series.map((s) => s.date);
    const amounts = series.map((s) => s.totalAmount);
    const itemsCounts = series.map((s) => s.itemCount);

    const option: EChartsCoreOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const idx = params[0].dataIndex;
          const pt = series[idx];
          if (!pt) return '';
          const avgPerItem = pt.itemCount > 0 ? pt.totalAmount / pt.itemCount : 0;
          return `<div style="min-width:195px;">
            <div style="font-weight:800;margin-bottom:5px;border-bottom:1px solid rgba(148,163,184,0.3);padding-bottom:4px;">
              Jornada: ${pt.date}
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Gasto Ejecutado:</span>
              <strong style="color:#10b981;font-variant-numeric:tabular-nums;">${formatMoney(pt.totalAmount)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Productos Comprados:</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatNumber(pt.itemCount, 0)} prod. (${formatNumber(pt.unitCount)} un.)</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px;">
              <span>Prom. por Producto:</span>
              <strong style="font-variant-numeric:tabular-nums;">${formatMoney(avgPerItem)}</strong>
            </div>
            ${
              pt.stores.length > 0
                ? `<div style="margin-top:5px;padding-top:4px;border-top:1px dashed rgba(148,163,184,0.3);font-size:11px;color:#94a3b8;">
                    Comercios: ${pt.stores.slice(0, 4).join(', ')}
                  </div>`
                : ''
            }
          </div>`;
        },
      },
      legend: {
        data: ['Gasto por Jornada ($)', 'Artículos Comprados'],
        textStyle: { color: textColor, fontSize: 11, fontWeight: 600 },
        top: 0,
      },
      grid: {
        left: '2%',
        right: '3%',
        bottom: '8%',
        top: '16%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor,
          fontSize: 11,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Gasto ($)',
          nameTextStyle: { color: mutedColor, fontSize: 10 },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
          axisLabel: {
            color: textColor,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5,
            formatter: (val: number) => `$${formatNumber(val, 0)}`,
          },
        },
        {
          type: 'value',
          name: 'Artículos',
          nameTextStyle: { color: mutedColor, fontSize: 10 },
          axisLine: { lineStyle: { color: gridColor } },
          splitLine: { show: false },
          axisLabel: {
            color: isDark ? '#60a5fa' : '#1d4ed8',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5,
            formatter: (val: number) => `${formatNumber(val, 0)}`,
          },
        },
      ],
      series: [
        {
          name: 'Gasto por Jornada ($)',
          type: 'bar',
          yAxisIndex: 0,
          barMaxWidth: 38,
          itemStyle: {
            color: isDark ? '#10b981' : '#047857',
            borderRadius: [4, 4, 0, 0],
          },
          data: amounts,
        },
        {
          name: 'Artículos Comprados',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color: isDark ? '#60a5fa' : '#1d4ed8', width: 2.5 },
          itemStyle: { color: isDark ? '#60a5fa' : '#1d4ed8' },
          data: itemsCounts,
        },
      ],
    };

    ticketHistoryChartInstance.current.setOption(option, true);
  }, [analytics, theme]);

  // Handle window resize for all 5 ECharts instances
  useEffect(() => {
    const handleResize = () => {
      mainChartInstance.current?.resize();
      donutChartInstance.current?.resize();
      paretoChartInstance.current?.resize();
      efficiencyChartInstance.current?.resize();
      ticketHistoryChartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      mainChartInstance.current?.dispose();
      mainChartInstance.current = null;
      donutChartInstance.current?.dispose();
      donutChartInstance.current = null;
      paretoChartInstance.current?.dispose();
      paretoChartInstance.current = null;
      efficiencyChartInstance.current?.dispose();
      efficiencyChartInstance.current = null;
      ticketHistoryChartInstance.current?.dispose();
      ticketHistoryChartInstance.current = null;
    };
  }, []);

  const topStore = analytics.storeBreakdown[0] || null;
  const topCategory = analytics.categoryBreakdown[0] || null;
  const mostExpensiveProduct = analytics.topProducts[0] || null;

  const filteredPriceVariations = useMemo(() => {
    return analytics.productPriceVariations.filter((item) => {
      if (variationFilter === 'up') return item.deltaPercent > 0;
      if (variationFilter === 'down') return item.deltaPercent < 0;
      return true;
    });
  }, [analytics.productPriceVariations, variationFilter]);

  const filteredRankedProducts = useMemo(() => {
    const list = analytics.topProducts.filter((item) => {
      if (rankingFilter === 'pending') return !item.completed;
      if (rankingFilter === 'completed') return item.completed;
      return true;
    });

    if (rankingSort === 'sku_asc') {
      return [...list].sort((a, b) => a.seqNumber - b.seqNumber);
    }
    return list;
  }, [analytics.topProducts, rankingFilter, rankingSort]);

  const toggleReceiptExpand = (id: string) => {
    setExpandedReceiptIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const activeParetoList =
    paretoGroupBy === 'store' ? analytics.paretoStores : analytics.paretoCategories;
  const classACount = activeParetoList.filter((i) => i.paretoClass === 'A').length;
  const classBCount = activeParetoList.filter((i) => i.paretoClass === 'B').length;
  const classCCount = activeParetoList.filter((i) => i.paretoClass === 'C').length;

  return (
    <section
      id="panel-stats"
      className="view-panel active stats-fullwidth-panel"
      role="tabpanel"
      aria-labelledby="tab-stats"
      tabIndex={0}
    >
      <div className="kpi-dashboard-wrapper" aria-label="Tablero ejecutivo de estadísticas financieras">
        {/* CABECERA EJECUTIVA DEL TABLERO FINANCIERO */}
        <div className="stats-executive-banner">
          <div className="stats-banner-left">
            <div className="stats-banner-badge">
              <BarChart3 size={18} />
            </div>
            <div>
              <h2 className="stats-banner-title">
                Inteligencia Financiera, Pareto 80/20 y Auditoría de Costos
              </h2>
              <p className="stats-banner-subtitle">
                Monitoreo integral a pantalla completa de ejecución presupuestaria, eficiencia por comercio y variación histórica de precios
              </p>
            </div>
          </div>

          <div className="stats-banner-actions tabular-nums">
            <div className="stats-banner-pill">
              <span className="pill-label">Comercios Clase A (80%)</span>
              <strong className="pill-val">
                {analytics.paretoClassAStoreCount} de {analytics.storeBreakdown.length} locales
              </strong>
            </div>
            <div className="stats-banner-pill">
              <span className="pill-label">Jornadas Registradas</span>
              <strong className="pill-val">{analytics.ticketHistorySeries.length} fechas</strong>
            </div>
            {onOpenReceiptScanner && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenReceiptScanner}
              >
                <Camera size={14} />
                <span>Escanear Ticket</span>
              </button>
            )}
          </div>
        </div>

        {/* FILA 1: 6 TARJETAS DE KPI EJECUTIVOS (GRILLA DE 6 COLUMNAS A ANCHO COMPLETO) */}
        <div className="kpi-cards-grid">
          {/* KPI 1: Presupuesto vs Comprometido */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <label htmlFor="budgetInput" className="stat-label">
                Presupuesto Objetivo
              </label>
              <Wallet size={18} className="kpi-icon kpi-icon-warning" aria-hidden="true" />
            </div>
            <div className="budget-input-inline-wrap">
              <span className="currency-prefix">$</span>
              <input
                type="text"
                inputMode="decimal"
                id="budgetInput"
                className="budget-minimal-input tabular-nums"
                placeholder="0,00"
                aria-label="Presupuesto disponible"
                value={budgetText}
                onFocus={() => setIsEditingBudget(true)}
                onBlur={() => {
                  setIsEditingBudget(false);
                  const parsed = parseLocaleNumber(budgetText);
                  setBudgetText(parsed > 0 ? formatNumber(parsed, 2) : '');
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setBudgetText(val);
                  onBudgetChange(parseLocaleNumber(val));
                }}
              />
            </div>
            <div className="kpi-sub-metrics tabular-nums">
              {analytics.budget > 0 ? (
                analytics.budgetRemaining < 0 ? (
                  <span className="kpi-status-danger">
                    Excedido por {formatMoney(Math.abs(analytics.budgetRemaining))} (
                    {formatNumber(analytics.budgetPercentage, 1)}%)
                  </span>
                ) : (
                  <span className="kpi-status-ok">
                    Disponible: {formatMoney(analytics.budgetRemaining)} (
                    {formatNumber(100 - analytics.budgetPercentage, 1)}% libre)
                  </span>
                )
              ) : (
                <span>Define un tope para medir desvíos</span>
              )}
            </div>
          </div>

          {/* KPI 2: Comprometido Total, Gastado Real y Pendiente */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">Comprometido vs. Gastado Real</span>
              <TrendingUp size={18} className="kpi-icon kpi-icon-primary" aria-hidden="true" />
            </div>
            <div className="kpi-Dual-values tabular-nums">
              <div>
                <span className="kpi-mini-caption">Por pagar (Pend.)</span>
                <span id="grandTotalValue" className="stat-value" aria-live="polite">
                  {formatMoney(analytics.totalPending)}
                </span>
              </div>
              <div className="kpi-right-align">
                <span className="kpi-mini-caption">Gastado Real</span>
                <span className="stat-value stat-value-emerald">
                  {formatMoney(analytics.totalSpent)}
                </span>
              </div>
            </div>

            <div className="progress-container progress-dual" title="Ejecución presupuestaria">
              <div
                id="budgetProgressBar"
                className="progress-bar"
                role="progressbar"
                aria-valuenow={analytics.budgetPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${formatNumber(analytics.budgetPercentage, 1)}% consumido`}
                aria-label="Progreso del presupuesto"
                style={{
                  width: `${
                    analytics.budget > 0
                      ? analytics.budgetPercentage
                      : analytics.totalOverall > 0
                      ? analytics.spentShareOfTotal
                      : 0
                  }%`,
                  backgroundColor:
                    analytics.budget > 0 && analytics.totalOverall > analytics.budget
                      ? 'var(--danger)'
                      : analytics.budgetPercentage > 80
                      ? 'var(--warning)'
                      : 'var(--primary)',
                }}
              />
            </div>

            <span id="budgetStats" className="budget-stats tabular-nums" aria-live="polite">
              Total Carrito: <strong>{formatMoney(analytics.totalOverall)}</strong> · Ejecutado:{' '}
              <strong>{formatNumber(analytics.spentShareOfTotal, 1)}%</strong>
            </span>
          </div>

          {/* KPI 3: Avance de Compra por #ID y Unidades */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">Avance de Compra (#ID)</span>
              <CheckCircle2 size={18} className="kpi-icon kpi-icon-success" aria-hidden="true" />
            </div>
            <div className="kpi-main-row tabular-nums">
              <span className="stat-value">{formatNumber(analytics.completionRateProducts, 1)}%</span>
              <span className="kpi-inline-detail">
                {formatNumber(analytics.completedProducts, 0)} de {formatNumber(analytics.totalProducts, 0)} productos
              </span>
            </div>
            <div className="progress-container">
              <div
                className="progress-bar"
                style={{
                  width: `${analytics.completionRateProducts}%`,
                  backgroundColor: 'var(--success)',
                }}
              />
            </div>
            <div className="kpi-sub-metrics tabular-nums">
              <span>
                Unidades: <strong>{formatNumber(analytics.completedUnits)}</strong> comp. /{' '}
                <strong>{formatNumber(analytics.pendingUnits)}</strong> pend. ({formatNumber(analytics.totalUnits)} total)
              </span>
            </div>
          </div>

          {/* KPI 4: Promedios por Producto (#ID) y por Unidad */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">Costo Promedio (#ID / Un.)</span>
              <Calculator size={18} className="kpi-icon kpi-icon-primary" aria-hidden="true" />
            </div>
            <div className="kpi-Dual-values tabular-nums">
              <div>
                <span className="kpi-mini-caption">Prom. por Producto</span>
                <span className="stat-value">{formatMoney(analytics.averageCostPerProduct)}</span>
              </div>
              <div className="kpi-right-align">
                <span className="kpi-mini-caption">Prom. por Unidad</span>
                <span className="stat-value stat-value-secondary">
                  {formatMoney(analytics.averageCostPerUnit)}
                </span>
              </div>
            </div>
            <div className="kpi-sub-metrics tabular-nums">
              <span>
                {formatNumber(analytics.pricedProductsCount, 0)} cotizados ·{' '}
                {formatNumber(analytics.unpricedProductsCount, 0)} sin precio ($0,00)
              </span>
            </div>
          </div>

          {/* KPI 5: Comercio Líder & Concentración Pareto 80/20 */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">Comercio Líder y Pareto 80/20</span>
              <Store size={18} className="kpi-icon kpi-icon-primary" aria-hidden="true" />
            </div>
            {topStore ? (
              <>
                <div className="kpi-main-row tabular-nums">
                  <strong className="kpi-highlight-name" title={topStore.name}>
                    {topStore.name}
                  </strong>
                  <span className="stat-value">{formatMoney(topStore.totalAmount)}</span>
                </div>
                <div className="kpi-sub-metrics tabular-nums">
                  <span>
                    Concentra el <strong>{formatNumber(topStore.shareOfTotalSpend, 1)}%</strong> ·{' '}
                    <strong>{analytics.paretoClassAStoreCount}</strong>{' '}
                    {analytics.paretoClassAStoreCount === 1 ? 'local suma' : 'locales suman'} el 80% (Clase A)
                  </span>
                </div>
              </>
            ) : (
              <div className="kpi-sub-metrics">Sin comercios registrados</div>
            )}
          </div>

          {/* KPI 6: Categoría Principal, #ID Más Costoso y Variación */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">#ID Más Costoso y Variación</span>
              <Tag size={18} className="kpi-icon kpi-icon-warning" aria-hidden="true" />
            </div>
            {mostExpensiveProduct ? (
              <>
                <div className="kpi-main-row tabular-nums">
                  <span className="kpi-highlight-name" title={mostExpensiveProduct.name}>
                    <span className="item-sku-code">{mostExpensiveProduct.skuCode}</span>{' '}
                    {mostExpensiveProduct.name}
                  </span>
                  <span className="stat-value">{formatMoney(mostExpensiveProduct.lineTotal)}</span>
                </div>
                <div className="kpi-sub-metrics tabular-nums">
                  <span>
                    Cat. líder: <strong>{topCategory ? topCategory.name : 'General'}</strong> (
                    {formatNumber(topCategory ? topCategory.shareOfTotalSpend : 0, 1)}%) · Var. prom.:{' '}
                    <strong
                      className={
                        analytics.avgInflationPercent > 0
                          ? 'kpi-status-danger'
                          : analytics.avgInflationPercent < 0
                          ? 'kpi-status-ok'
                          : ''
                      }
                    >
                      {analytics.avgInflationPercent > 0 ? '+' : ''}
                      {formatNumber(analytics.avgInflationPercent, 1)}%
                    </strong>
                  </span>
                </div>
              </>
            ) : (
              <div className="kpi-sub-metrics">Sin artículos cotizados</div>
            )}
          </div>
        </div>

        {/* FILA 2: GRÁFICO COMPARATIVO PRINCIPAL (8 COLS) + BALANCE PRESUPUESTARIO DONUT (4 COLS) */}
        <div className="kpi-charts-row">
          <div className="stat-card chart-box kpi-main-chart-card">
            <div className="chart-header-controls">
              <div>
                <span className="stat-label">
                  Análisis Comparativo por {groupBy === 'store' ? 'Comercio' : 'Categoría'}
                </span>
                <h3 className="chart-card-title">
                  {metricType === 'currency'
                    ? 'Gasto Real ($) vs. Pendiente ($)'
                    : metricType === 'units'
                    ? 'Unidades Compradas vs. Pendientes'
                    : 'Productos (#ID) Comprados vs. Pendientes'}
                </h3>
              </div>

              <div className="chart-segmented-group">
                <div className="segmented-control" role="group" aria-label="Agrupar gráfico por">
                  <button
                    type="button"
                    className={`seg-btn ${groupBy === 'store' ? 'active' : ''}`}
                    onClick={() => setGroupBy('store')}
                  >
                    Por Comercio
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${groupBy === 'category' ? 'active' : ''}`}
                    onClick={() => setGroupBy('category')}
                  >
                    Por Categoría
                  </button>
                </div>

                <div className="segmented-control" role="group" aria-label="Métrica del gráfico">
                  <button
                    type="button"
                    className={`seg-btn ${metricType === 'currency' ? 'active' : ''}`}
                    onClick={() => setMetricType('currency')}
                  >
                    Gasto ($)
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${metricType === 'units' ? 'active' : ''}`}
                    onClick={() => setMetricType('units')}
                  >
                    Unidades
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${metricType === 'products' ? 'active' : ''}`}
                    onClick={() => setMetricType('products')}
                  >
                    #IDs
                  </button>
                </div>
              </div>
            </div>

            <div
              id="categoryChart"
              ref={mainChartRef}
              className="chart-canvas"
              role="img"
              aria-label="Gráfico interactivo de gastos y unidades por comercio y categoría"
              style={{ width: '100%', height: '330px' }}
            />
          </div>

          <div className="stat-card chart-box kpi-donut-chart-card">
            <div className="chart-header-controls">
              <div>
                <span className="stat-label">Distribución Financiera</span>
                <h3 className="chart-card-title">Presupuesto vs. Ejecución</h3>
              </div>
              <PieChartIcon size={18} className="kpi-icon-primary" />
            </div>
            <div
              ref={donutChartRef}
              className="chart-canvas"
              role="img"
              aria-label="Gráfico de proporción entre gasto ejecutado, pendiente y presupuesto"
              style={{ width: '100%', height: '260px' }}
            />
            <div className="donut-summary-footer tabular-nums">
              <div className="donut-summary-item">
                <span className="donut-dot dot-emerald" />
                <span>Ejecutado:</span>
                <strong>{formatMoney(analytics.totalSpent)}</strong>
              </div>
              <div className="donut-summary-item">
                <span className="donut-dot dot-cobalt" />
                <span>Pendiente:</span>
                <strong>{formatMoney(analytics.totalPending)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* FILA 3 (NUEVO): CURVA DE PARETO 80/20 (6 COLS) + MATRIZ DE EFICIENCIA POR LOCAL (6 COLS) */}
        <div className="stats-advanced-two-col-grid">
          {/* PANEL IZQUIERDO: CURVA DE PARETO 80-20 Y CONCENTRACIÓN DE GASTO */}
          <div className="stat-card chart-box stats-advanced-card">
            <div className="chart-header-controls">
              <div>
                <span className="stat-label">Concentración Financiera ABC (Regla 80/20)</span>
                <h3 className="chart-card-title">
                  Curva de Pareto 80/20 por {paretoGroupBy === 'store' ? 'Comercio' : 'Categoría'}
                </h3>
              </div>

              <div className="segmented-control" role="group" aria-label="Dimensión de Pareto">
                <button
                  type="button"
                  className={`seg-btn ${paretoGroupBy === 'store' ? 'active' : ''}`}
                  onClick={() => setParetoGroupBy('store')}
                >
                  Comercios
                </button>
                <button
                  type="button"
                  className={`seg-btn ${paretoGroupBy === 'category' ? 'active' : ''}`}
                  onClick={() => setParetoGroupBy('category')}
                >
                  Categorías
                </button>
              </div>
            </div>

            <div
              ref={paretoChartRef}
              className="chart-canvas"
              role="img"
              aria-label="Gráfico de Curva de Pareto 80-20 con barras de gasto y curva de porcentaje acumulado"
              style={{ width: '100%', height: '300px' }}
            />

            <div className="pareto-abc-legend-strip tabular-nums">
              <div className="pareto-abc-box class-a">
                <span className="abc-tag">Clase A · Vitales (0–80%)</span>
                <strong>
                  {classACount} {paretoGroupBy === 'store' ? 'locales' : 'categorías'} concentran el grueso del gasto
                </strong>
              </div>
              <div className="pareto-abc-box class-b">
                <span className="abc-tag">Clase B · Intermedios (80–95%)</span>
                <strong>
                  {classBCount} {paretoGroupBy === 'store' ? 'locales' : 'categorías'}
                </strong>
              </div>
              <div className="pareto-abc-box class-c">
                <span className="abc-tag">Clase C · Complementarios (&gt;95%)</span>
                <strong>
                  {classCCount} {paretoGroupBy === 'store' ? 'locales' : 'categorías'}
                </strong>
              </div>
            </div>
          </div>

          {/* PANEL DERECHO: MATRIZ DE EFICIENCIA POR LOCAL (GRÁFICO MULTIVARIABLE) */}
          <div className="stat-card chart-box stats-advanced-card">
            <div className="chart-header-controls">
              <div>
                <span className="stat-label">Densidad de Ticket y Costo Unitario por Comercio</span>
                <h3 className="chart-card-title">
                  Matriz de Eficiencia por Local (Costo Promedio vs. Cantidad de Ítems)
                </h3>
              </div>
              <Layers size={18} className="kpi-icon-primary" />
            </div>

            <div
              ref={efficiencyChartRef}
              className="chart-canvas"
              role="img"
              aria-label="Gráfico de Matriz de Eficiencia por Local comparando costo promedio por producto y cantidad de ítems"
              style={{ width: '100%', height: '300px' }}
            />

            <div className="pareto-abc-legend-strip tabular-nums">
              <div className="pareto-abc-box">
                <span className="abc-tag">Ticket Promedio Global / Local</span>
                <strong>
                  {analytics.storeBreakdown.length > 0
                    ? formatMoney(analytics.totalOverall / analytics.storeBreakdown.length)
                    : '$0,00'}
                </strong>
              </div>
              <div className="pareto-abc-box">
                <span className="abc-tag">Costo Promedio / #ID</span>
                <strong>{formatMoney(analytics.averageCostPerProduct)}</strong>
              </div>
              <div className="pareto-abc-box">
                <span className="abc-tag">Costo Promedio / Unidad</span>
                <strong>{formatMoney(analytics.averageCostPerUnit)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* FILA 4 (NUEVO): EVOLUCIÓN HISTÓRICA DE TICKETS (6 COLS) + VARIACIÓN / INFLACIÓN DE PRECIOS POR PRODUCTO (6 COLS) */}
        <div className="stats-advanced-two-col-grid">
          {/* PANEL IZQUIERDO: EVOLUCIÓN HISTÓRICA DE TICKETS Y COMPRAS REALIZADAS */}
          <div className="stat-card chart-box stats-advanced-card">
            <div className="chart-header-controls">
              <div>
                <span className="stat-label">Flujo Cronológico de Compras Ejecutadas</span>
                <h3 className="chart-card-title">
                  Evolución Histórica de Tickets y Jornadas de Compra ({analytics.ticketHistorySeries.length})
                </h3>
              </div>
              <Activity size={18} className="kpi-icon-success" />
            </div>

            <div
              ref={ticketHistoryChartRef}
              className="chart-canvas"
              role="img"
              aria-label="Gráfico de evolución histórica de compras y tickets por fecha"
              style={{ width: '100%', height: '310px' }}
            />
          </div>

          {/* PANEL DERECHO: MONITOR DE INFLACIÓN Y VARIACIÓN DE PRECIOS POR PRODUCTO */}
          <div className="stat-card chart-box stats-advanced-card">
            <div className="chart-header-controls">
              <div>
                <span className="stat-label">Auditoría Histórica de Precios por #ID</span>
                <h3 className="chart-card-title">
                  Inflación y Variación de Precios por Producto ({filteredPriceVariations.length})
                </h3>
              </div>

              <div className="segmented-control" role="group" aria-label="Filtrar variación de precios">
                <button
                  type="button"
                  className={`seg-btn ${variationFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setVariationFilter('all')}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`seg-btn ${variationFilter === 'up' ? 'active' : ''}`}
                  onClick={() => setVariationFilter('up')}
                >
                  Subas ▲
                </button>
                <button
                  type="button"
                  className={`seg-btn ${variationFilter === 'down' ? 'active' : ''}`}
                  onClick={() => setVariationFilter('down')}
                >
                  Bajas ▼
                </button>
              </div>
            </div>

            <div className="price-variation-table-wrap">
              {filteredPriceVariations.length === 0 ? (
                <p className="empty-stops-text">
                  No hay productos con ese filtro de variación. A medida que registres tickets o actualices precios, verás aquí el porcentaje de inflación o ahorro de cada artículo.
                </p>
              ) : (
                <table className="kpi-audit-table tabular-nums">
                  <thead>
                    <tr>
                      <th>#ID</th>
                      <th>Producto</th>
                      <th>Comercio Actual</th>
                      <th className="num-col">Precio Base / Ant.</th>
                      <th className="num-col">Precio Actual</th>
                      <th className="num-col">Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPriceVariations.slice(0, 12).map((pv) => {
                      const isUp = pv.deltaPercent > 0;
                      const isDown = pv.deltaPercent < 0;
                      return (
                        <tr key={pv.id}>
                          <td>
                            <span className="item-sku-code">{pv.skuCode}</span>
                          </td>
                          <td>
                            <div className="pv-product-cell">
                              <strong className="pv-prod-name">{pv.name}</strong>
                              <span className="pv-prod-meta">
                                Rango: {formatMoney(pv.minHistoricalPrice)} –{' '}
                                {formatMoney(pv.maxHistoricalPrice)}
                              </span>
                            </div>
                          </td>
                          <td>{pv.currentStore}</td>
                          <td className="num-col">
                            <div className="pv-price-sub-cell">
                              <span>{formatMoney(pv.previousPrice)}</span>
                              <small>{pv.previousDate}</small>
                            </div>
                          </td>
                          <td className="num-col font-bold">{formatMoney(pv.currentPrice)}</td>
                          <td className="num-col">
                            <span
                              className={`price-delta-badge ${
                                isUp ? 'is-up' : isDown ? 'is-down' : 'is-flat'
                              }`}
                            >
                              {isUp ? (
                                <TrendingUp size={12} />
                              ) : isDown ? (
                                <TrendingDown size={12} />
                              ) : null}
                              <span>
                                {isUp ? '+' : ''}
                                {formatNumber(pv.deltaPercent, 1)}%
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* FILA 5: MATRIZ COMPLETA DE EFICIENCIA Y DESGLOSE FINANCIERO POR COMERCIO (PLEGABLE) */}
        {analytics.storeEfficiencyMatrix.length > 0 && (
          <div className="stat-card kpi-collapsible-table-card">
            <div
              className="kpi-section-collapse-header"
              role="button"
              tabIndex={0}
              aria-expanded={!isStoreTableCollapsed}
              onClick={() => setIsStoreTableCollapsed((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsStoreTableCollapsed((prev) => !prev);
                }
              }}
            >
              <div className="kpi-collapse-title-wrap">
                {isStoreTableCollapsed ? (
                  <ChevronRight size={18} aria-hidden="true" />
                ) : (
                  <ChevronDown size={18} aria-hidden="true" />
                )}
                <Store size={18} className="kpi-icon-primary" aria-hidden="true" />
                <h3>
                  Matriz Ejecutiva de Eficiencia por Local: Costo Promedio, Ítems y Peso Porcentual (
                  {formatNumber(analytics.storeEfficiencyMatrix.length, 0)})
                </h3>
              </div>
              <span className="btn-collapse-section-inline">
                {isStoreTableCollapsed ? 'Expandir' : 'Contraer'}
              </span>
            </div>

            {!isStoreTableCollapsed && (
              <div className="kpi-table-scroll">
                <table className="kpi-audit-table tabular-nums">
                  <thead>
                    <tr>
                      <th>Clase Pareto</th>
                      <th>Comercio</th>
                      <th className="num-col">#IDs (Comp. / Total)</th>
                      <th className="num-col">Unidades</th>
                      <th className="num-col">Costo Prom. / #ID</th>
                      <th className="num-col">Costo Prom. / Un.</th>
                      <th className="num-col">Gastado Real</th>
                      <th className="num-col">Pendiente</th>
                      <th className="num-col">Total Comercio</th>
                      <th className="num-col">Peso % y Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.storeEfficiencyMatrix.map((st) => (
                      <tr key={st.name}>
                        <td>
                          <span className={`pareto-class-pill pareto-class-${st.paretoClass.toLowerCase()}`}>
                            Clase {st.paretoClass}
                          </span>
                        </td>
                        <td className="font-bold">{st.name}</td>
                        <td className="num-col">
                          {formatNumber(st.completedProductCount, 0)} /{' '}
                          {formatNumber(st.productCount, 0)} ({formatNumber(st.completionRate, 0)}%)
                        </td>
                        <td className="num-col">{formatNumber(st.totalUnits)} un.</td>
                        <td className="num-col font-bold">{formatMoney(st.avgCostPerProduct)}</td>
                        <td className="num-col">{formatMoney(st.avgCostPerUnit)}</td>
                        <td className="num-col text-emerald">{formatMoney(st.spentAmount)}</td>
                        <td className="num-col text-indigo">{formatMoney(st.pendingAmount)}</td>
                        <td className="num-col font-bold">{formatMoney(st.totalAmount)}</td>
                        <td className="num-col">
                          <div className="store-weight-bar-cell">
                            <div className="store-weight-text">
                              <strong>{formatNumber(st.shareOfTotalSpend, 1)}%</strong>
                              <small>Acum.: {formatNumber(st.cumulativeShare, 1)}%</small>
                            </div>
                            <div className="store-weight-track">
                              <div
                                className="store-weight-fill"
                                style={{ width: `${Math.min(100, st.shareOfTotalSpend)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FILA 6: TICKETS PROCESADOS Y SEGUIMIENTO DE COMPRAS REALIZADAS (PLEGABLE) */}
        <div className="stat-card kpi-collapsible-table-card">
          <div
            className="kpi-section-collapse-header"
            role="button"
            tabIndex={0}
            aria-expanded={!isReceiptsSectionCollapsed}
            onClick={() => setIsReceiptsSectionCollapsed((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsReceiptsSectionCollapsed((prev) => !prev);
              }
            }}
          >
            <div className="kpi-collapse-title-wrap">
              {isReceiptsSectionCollapsed ? (
                <ChevronRight size={18} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} aria-hidden="true" />
              )}
              <Receipt size={18} className="kpi-icon-primary" aria-hidden="true" />
              <h3>
                Seguimiento de Tickets de Compra Procesados ({formatNumber(receipts.length, 0)})
              </h3>
            </div>

            <div className="kpi-table-Controls" onClick={(e) => e.stopPropagation()}>
              {onOpenReceiptScanner && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={onOpenReceiptScanner}
                >
                  <Camera size={14} aria-hidden="true" />
                  <span>Subir Foto de Ticket</span>
                </button>
              )}
              <button
                type="button"
                className="btn-collapse-section-inline"
                onClick={() => setIsReceiptsSectionCollapsed((prev) => !prev)}
              >
                {isReceiptsSectionCollapsed ? 'Expandir' : 'Contraer'}
              </button>
            </div>
          </div>

          {!isReceiptsSectionCollapsed && (
            <div className="kpi-table-scroll">
              {receipts.length === 0 ? (
                <div className="receipt-empty-inline">
                  <p className="empty-stops-text">
                    Aún no has subido tickets de compra. Sube una foto de tu ticket para registrar automáticamente qué compraste, en qué comercio y a qué precio.
                  </p>
                </div>
              ) : (
                <div className="receipt-history-list">
                  {receipts.map((rcpt) => {
                    const isExpanded = Boolean(expandedReceiptIds[rcpt.id]);
                    return (
                      <div key={rcpt.id} className="receipt-history-card">
                        <div
                          className="receipt-history-header"
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          onClick={() => toggleReceiptExpand(rcpt.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleReceiptExpand(rcpt.id);
                            }
                          }}
                        >
                          <div className="receipt-history-left">
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            {rcpt.imagePreview && (
                              <img
                                src={rcpt.imagePreview}
                                alt={`Ticket ${rcpt.storeName}`}
                                className="receipt-history-mini-thumb"
                              />
                            )}
                            <div>
                              <strong className="receipt-history-store">{rcpt.storeName}</strong>
                              <span className="receipt-history-meta tabular-nums">
                                {rcpt.date}
                                {rcpt.receiptNumber ? ` · Comp. #${rcpt.receiptNumber}` : ''} ·{' '}
                                {formatNumber(rcpt.items.length, 0)} productos
                              </span>
                            </div>
                          </div>

                          <div
                            className="receipt-history-right tabular-nums"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <strong className="receipt-history-total">
                              {formatMoney(rcpt.total)}
                            </strong>
                            {onDeleteReceipt && (
                              <button
                                type="button"
                                className="btn-item-action btn-delete-item"
                                title="Eliminar registro de ticket"
                                onClick={() => onDeleteReceipt(rcpt.id)}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="receipt-history-items">
                            <table className="kpi-audit-table tabular-nums">
                              <thead>
                                <tr>
                                  <th>#ID</th>
                                  <th>Producto</th>
                                  <th>Categoría</th>
                                  <th className="num-col">Cant.</th>
                                  <th className="num-col">Precio Unit.</th>
                                  <th className="num-col">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rcpt.items.map((it, idx) => (
                                  <tr key={idx}>
                                    <td>
                                      <span className="item-sku-code">
                                        {it.skuCode || `#${String(idx + 1).padStart(3, '0')}`}
                                      </span>
                                    </td>
                                    <td className="font-bold">{it.name}</td>
                                    <td>{it.category}</td>
                                    <td className="num-col">{formatNumber(it.quantity)} un.</td>
                                    <td className="num-col">{formatMoney(it.unitPrice)}</td>
                                    <td className="num-col font-bold">
                                      {formatMoney(it.lineTotal)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* FILA 7: RANKING Y AUDITORÍA DE PRODUCTOS CONTABILIZADOS POR #ID (PLEGABLE) */}
        <div className="stat-card kpi-collapsible-table-card">
          <div
            className="kpi-section-collapse-header"
            role="button"
            tabIndex={0}
            aria-expanded={!isRankingCollapsed}
            onClick={() => setIsRankingCollapsed((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsRankingCollapsed((prev) => !prev);
              }
            }}
          >
            <div className="kpi-collapse-title-wrap">
              {isRankingCollapsed ? (
                <ChevronRight size={18} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} aria-hidden="true" />
              )}
              <Hash size={18} className="kpi-icon-primary" aria-hidden="true" />
              <h3>
                Top Productos Más Caros y Contabilidad por #ID ({formatNumber(filteredRankedProducts.length, 0)})
              </h3>
            </div>

            <div className="kpi-table-Controls" onClick={(e) => e.stopPropagation()}>
              <div className="segmented-control" role="group" aria-label="Filtrar productos en tabla">
                <button
                  type="button"
                  className={`seg-btn ${rankingFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setRankingFilter('all')}
                >
                  Todos ({formatNumber(analytics.totalProducts, 0)})
                </button>
                <button
                  type="button"
                  className={`seg-btn ${rankingFilter === 'pending' ? 'active' : ''}`}
                  onClick={() => setRankingFilter('pending')}
                >
                  Pendientes ({formatNumber(analytics.pendingProducts, 0)})
                </button>
                <button
                  type="button"
                  className={`seg-btn ${rankingFilter === 'completed' ? 'active' : ''}`}
                  onClick={() => setRankingFilter('completed')}
                >
                  Comprados ({formatNumber(analytics.completedProducts, 0)})
                </button>
              </div>

              <button
                type="button"
                className="btn-collapse-section-inline"
                title="Alternar orden entre Mayor Costo ($) y Código Secuencial (#001)"
                onClick={() =>
                  setRankingSort((prev) => (prev === 'cost_desc' ? 'sku_asc' : 'cost_desc'))
                }
              >
                <ArrowUpDown size={13} aria-hidden="true" />
                <span>{rankingSort === 'cost_desc' ? 'Orden: Mayor $' : 'Orden: #001'}</span>
              </button>

              <button
                type="button"
                className="btn-collapse-section-inline"
                onClick={() => setIsRankingCollapsed((prev) => !prev)}
              >
                {isRankingCollapsed ? 'Expandir' : 'Contraer'}
              </button>
            </div>
          </div>

          {!isRankingCollapsed && (
            <div className="kpi-table-scroll">
              {filteredRankedProducts.length === 0 ? (
                <p className="empty-stops-text">No hay productos para este filtro.</p>
              ) : (
                <table className="kpi-audit-table tabular-nums">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>ID</th>
                      <th>Producto</th>
                      <th>Comercio</th>
                      <th>Categoría</th>
                      <th>Fecha Compra</th>
                      <th className="num-col">Cant.</th>
                      <th className="num-col">Precio Unit.</th>
                      <th className="num-col">Subtotal</th>
                      <th className="num-col">% del Total</th>
                      <th>Reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRankedProducts.map((prod) => (
                      <tr
                        key={prod.id}
                        className={prod.completed ? 'audit-row-completed' : ''}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={prod.completed}
                            onChange={() => onToggleCompleted && onToggleCompleted(prod.id)}
                            aria-label={`Cambiar estado de ${prod.skuCode} ${prod.name}`}
                          />
                        </td>
                        <td>
                          <span className="item-sku-code">{prod.skuCode}</span>
                        </td>
                        <td className="font-bold">{prod.name}</td>
                        <td>{prod.location}</td>
                        <td>{prod.category}</td>
                        <td>
                          {prod.completed ? (
                            <span
                              className={`item-purchase-date-badge tabular-nums ${
                                prod.lastPurchasedDate ? 'has-date' : 'no-date'
                              }`}
                            >
                              <Calendar size={11} aria-hidden="true" />
                              <span>{prod.lastPurchasedDate || 'Sin fecha'}</span>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="num-col">{formatNumber(prod.quantity)} un.</td>
                        <td className="num-col">{formatMoney(prod.unitPrice)}</td>
                        <td className="num-col font-bold">{formatMoney(prod.lineTotal)}</td>
                        <td className="num-col">{formatNumber(prod.shareOfTotal, 1)}%</td>
                        <td>
                          {onResetItem && (
                            <button
                              type="button"
                              className={`btn-item-action btn-reset-item ${
                                prod.completed ? 'is-completed-reset' : ''
                              }`}
                              title={`Resetear ${prod.skuCode} ${prod.name} a pendiente (conservando el producto)`}
                              onClick={() => onResetItem(prod.id)}
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* BOTÓN DE RESETEO DE COMPRADOS CONSERVANDO TODOS LOS PRODUCTOS */}
        <div className="stats-actions">
          <button
            id="resetListButton"
            className="btn btn-secondary btn-block"
            type="button"
            aria-label="Resetear todos los productos marcados como comprados a pendientes sin borrarlos"
            disabled={analytics.completedProducts === 0}
            onClick={onResetAllCompleted}
          >
            <RotateCcw size={18} aria-hidden="true" />
            <span>
              Resetear Comprados para Nueva Compra con Fecha ({formatNumber(analytics.completedProducts, 0)} productos · Conserva todos tus #ID)
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};
