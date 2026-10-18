import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import {
  Trash2,
  Wallet,
  TrendingUp,
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
} from 'lucide-react';
import { ShoppingItem, FinancialMetrics, PurchaseReceipt } from '../types';
import { calculateDetailedAnalytics } from '../utils/analytics';
import { formatMoney, formatCurrency, formatNumber, parseLocaleNumber } from '../utils/formatters';

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

  const mainChartRef = useRef<HTMLDivElement | null>(null);
  const mainChartInstance = useRef<echarts.EChartsType | null>(null);

  const donutChartRef = useRef<HTMLDivElement | null>(null);
  const donutChartInstance = useRef<echarts.EChartsType | null>(null);

  const analytics = useMemo(
    () => calculateDetailedAnalytics(items, budget),
    [items, budget]
  );

  // Render Main Bar Chart (Store or Category | $ or Units or #ID | Spent vs Pending)
  useEffect(() => {
    if (!mainChartRef.current) return;

    if (mainChartInstance.current) {
      mainChartInstance.current.dispose();
    }
    mainChartInstance.current = echarts.init(
      mainChartRef.current,
      theme === 'dark' ? 'dark' : undefined
    );

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

    const option: echarts.EChartsOption = {
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
          return `<div style="min-width:170px;">
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
          rotate: labels.length > 6 ? 24 : 0,
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
        axisLabel: {
          color: textColor,
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
          emphasis: { focus: 'series' },
          itemStyle: {
            color: isDark ? '#818cf8' : '#4f46e5',
            borderRadius: [0, 0, 0, 0],
          },
          data: pendingSeriesData,
        },
        {
          name: 'Gastado real (Comprado)',
          type: 'bar',
          stack: 'total',
          emphasis: { focus: 'series' },
          itemStyle: {
            color: isDark ? '#34d399' : '#047857',
            borderRadius: [6, 6, 0, 0],
          },
          data: spentSeriesData,
        },
      ],
    };

    mainChartInstance.current.setOption(option, true);
  }, [analytics, groupBy, metricType, theme]);

  // Render Secondary Donut Chart (Budget vs Committed & Completion)
  useEffect(() => {
    if (!donutChartRef.current) return;

    if (donutChartInstance.current) {
      donutChartInstance.current.dispose();
    }
    donutChartInstance.current = echarts.init(
      donutChartRef.current,
      theme === 'dark' ? 'dark' : undefined
    );

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
        itemStyle: { color: isDark ? '#34d399' : '#047857' },
      });
      donutData.push({
        value: analytics.totalPending,
        name: 'Pendiente ($)',
        itemStyle: { color: isDark ? '#818cf8' : '#4f46e5' },
      });
      if (analytics.budget > analytics.totalOverall) {
        donutData.push({
          value: Math.max(0, Math.round((analytics.budget - analytics.totalOverall) * 100) / 100),
          name: 'Presupuesto Libre ($)',
          itemStyle: { color: isDark ? '#334155' : '#cbd5e1' },
        });
      }
    } else {
      donutData.push({
        value: analytics.completedProducts,
        name: 'Comprados (#ID)',
        itemStyle: { color: isDark ? '#34d399' : '#047857' },
      });
      donutData.push({
        value: analytics.pendingProducts,
        name: 'Pendientes (#ID)',
        itemStyle: { color: isDark ? '#818cf8' : '#4f46e5' },
      });
    }

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const isMoney = String(p.name).includes('$');
          const valStr = isMoney ? formatMoney(p.value) : `${formatNumber(p.value, 0)} art.`;
          return `<strong>${p.name}</strong><br/>${valStr} (${formatNumber(p.percent, 1)}%)`;
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
          radius: ['48%', '74%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? '#1e293b' : '#ffffff',
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

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      mainChartInstance.current?.resize();
      donutChartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      mainChartInstance.current?.dispose();
      mainChartInstance.current = null;
      donutChartInstance.current?.dispose();
      donutChartInstance.current = null;
    };
  }, []);

  const topStore = analytics.storeBreakdown[0] || null;
  const topCategory = analytics.categoryBreakdown[0] || null;
  const mostExpensiveProduct = analytics.topProducts[0] || null;

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

  return (
    <section
      id="panel-stats"
      className="view-panel active"
      role="tabpanel"
      aria-labelledby="tab-stats"
      tabIndex={0}
    >
      <div className="kpi-dashboard-wrapper" aria-label="Resumen financiero y estadísticas">
        {/* FILA 1: 6 TARJETAS DE KPI EJECUTIVOS */}
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

            {/* Barra de progreso dual (Gastado + Pendiente) */}
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
                {formatNumber(analytics.completedProducts, 0)} de {formatNumber(analytics.totalProducts, 0)} productos (#ID)
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
                Unidades físicas: <strong>{formatNumber(analytics.completedUnits)}</strong> compradas /{' '}
                <strong>{formatNumber(analytics.pendingUnits)}</strong> pend. ({formatNumber(analytics.totalUnits)} total)
              </span>
            </div>
          </div>

          {/* KPI 4: Promedios por Producto (#ID) y por Unidad */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">Costo Promedio por #ID y Unidad</span>
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
                {formatNumber(analytics.pricedProductsCount, 0)} productos con precio ·{' '}
                {formatNumber(analytics.unpricedProductsCount, 0)} sin precio ($0,00)
              </span>
            </div>
          </div>

          {/* KPI 5: Comercio con Mayor Gasto */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">Comercio de Mayor Gasto</span>
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
                    Representa el <strong>{formatNumber(topStore.shareOfTotalSpend, 1)}%</strong> del gasto ·{' '}
                    {formatNumber(topStore.productCount, 0)} productos ({formatNumber(topStore.pendingProductCount, 0)} pend.)
                  </span>
                </div>
              </>
            ) : (
              <div className="kpi-sub-metrics">Sin comercios registrados</div>
            )}
          </div>

          {/* KPI 6: Categoría Principal y Producto #ID Más Costoso */}
          <div className="stat-card kpi-card">
            <div className="kpi-card-header">
              <span className="stat-label">Categoría y #ID Más Costoso</span>
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
                    {topCategory ? formatMoney(topCategory.totalAmount) : '$0,00'} ·{' '}
                    {formatNumber(topCategory ? topCategory.shareOfTotalSpend : 0, 1)}%)
                  </span>
                </div>
              </>
            ) : (
              <div className="kpi-sub-metrics">Sin artículos cotizados</div>
            )}
          </div>
        </div>

        {/* FILA 2: GRÁFICOS INTERACTIVOS ECHARTS */}
        <div className="kpi-charts-row">
          {/* Gráfico Principal con Selectores Segmentados */}
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
              style={{ width: '100%', height: '320px' }}
            />
          </div>

          {/* Gráfico Donut de Balance Presupuestario */}
          <div className="stat-card chart-box kpi-donut-chart-card">
            <span className="stat-label">Distribución Financiera</span>
            <h3 className="chart-card-title">Presupuesto vs. Ejecución</h3>
            <div
              ref={donutChartRef}
              className="chart-canvas"
              role="img"
              aria-label="Gráfico de proporción entre gasto ejecutado, pendiente y presupuesto"
              style={{ width: '100%', height: '280px' }}
            />
          </div>
        </div>

        {/* FILA 3: TICKETS PROCESADOS Y SEGUIMIENTO DE COMPRAS REALIZADAS (PLEGABLE) */}
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

        {/* FILA 4: RESUMEN DETALLADO POR COMERCIO (PLEGABLE) */}
        {analytics.storeBreakdown.length > 0 && (
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
                <h3>Desglose Financiero por Comercio ({formatNumber(analytics.storeBreakdown.length, 0)})</h3>
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
                      <th>Comercio</th>
                      <th className="num-col">#IDs (Comp. / Total)</th>
                      <th className="num-col">Unidades</th>
                      <th className="num-col">Gastado Real</th>
                      <th className="num-col">Pendiente</th>
                      <th className="num-col">Total Comercio</th>
                      <th className="num-col">% Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.storeBreakdown.map((st) => (
                      <tr key={st.name}>
                        <td className="font-bold">{st.name}</td>
                        <td className="num-col">
                          {formatNumber(st.completedProductCount, 0)} / {formatNumber(st.productCount, 0)}
                        </td>
                        <td className="num-col">{formatNumber(st.totalUnits)} un.</td>
                        <td className="num-col text-emerald">{formatMoney(st.spentAmount)}</td>
                        <td className="num-col text-indigo">{formatMoney(st.pendingAmount)}</td>
                        <td className="num-col font-bold">{formatMoney(st.totalAmount)}</td>
                        <td className="num-col">{formatNumber(st.shareOfTotalSpend, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FILA 5: RANKING Y AUDITORÍA DE PRODUCTOS CONTABILIZADOS POR #ID (PLEGABLE) */}
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
