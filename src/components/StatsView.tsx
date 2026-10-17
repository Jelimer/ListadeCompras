import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Trash2 } from 'lucide-react';
import { ShoppingItem, FinancialMetrics } from '../types';
import { getCategoryBreakdown } from '../utils/analytics';

interface StatsViewProps {
  items: ShoppingItem[];
  budget: number;
  onBudgetChange: (budget: number) => void;
  metrics: FinancialMetrics;
  onClearCompleted: () => void;
  theme: 'light' | 'dark';
}

export const StatsView: React.FC<StatsViewProps> = ({
  items,
  budget,
  onBudgetChange,
  metrics,
  onClearCompleted,
  theme,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartContainerRef.current, theme === 'dark' ? 'dark' : undefined);
    }

    const breakdown = getCategoryBreakdown(items);
    const locations = Object.keys(breakdown);

    // Collect all distinct categories
    const categoriesSet = new Set<string>();
    locations.forEach((loc) => {
      Object.keys(breakdown[loc]).forEach((cat) => categoriesSet.add(cat));
    });
    const categories = Array.from(categoriesSet);

    if (categories.length === 0) {
      chartInstanceRef.current.setOption({
        title: {
          text: 'No hay productos pendientes para graficar',
          left: 'center',
          top: 'center',
          textStyle: {
            color: theme === 'dark' ? '#94a3b8' : '#64748b',
            fontSize: 14,
            fontWeight: 'normal',
          },
        },
        series: [],
      }, true);
      return;
    }

    // Build series per category for stacked bar chart
    const series = categories.map((cat) => {
      return {
        name: cat,
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        data: locations.map((loc) => breakdown[loc][cat] || 0),
      };
    });

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        data: categories,
        textStyle: { color: textColor },
        top: 0,
        type: 'scroll',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: '18%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: locations,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: textColor },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
        axisLabel: { color: textColor },
      },
      series: series as any,
    };

    chartInstanceRef.current.setOption(option, true);
  }, [items, theme]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  const completedCount = items.filter((it) => it.completed).length;

  return (
    <section id="panel-stats" className="view-panel active" role="tabpanel" aria-labelledby="tab-stats" tabIndex={0}>
      <aside className="stats-panel" aria-label="Resumen financiero y estadísticas">
        <div className="stat-card">
          <label htmlFor="budgetInput" className="stat-label">
            Presupuesto
          </label>
          <input
            type="number"
            id="budgetInput"
            className="budget-minimal-input"
            placeholder="0.00"
            min="0"
            step="0.01"
            aria-label="Presupuesto disponible"
            value={budget > 0 ? budget : ''}
            onChange={(e) => onBudgetChange(parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="stat-card">
          <span className="stat-label">Total Pendiente</span>
          <span id="grandTotalValue" className="stat-value" aria-live="polite">
            ${metrics.totalPending.toFixed(2)}
          </span>
          <div className="progress-container">
            <div
              id="budgetProgressBar"
              className="progress-bar"
              role="progressbar"
              aria-valuenow={metrics.budgetPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${metrics.budgetPercentage}% consumido`}
              aria-label="Progreso del presupuesto"
              style={{
                width: `${metrics.budgetPercentage}%`,
                backgroundColor:
                  metrics.budget > 0 && metrics.totalPending + metrics.totalSpent > metrics.budget
                    ? 'var(--danger)'
                    : metrics.budgetPercentage > 80
                    ? 'var(--warning)'
                    : 'var(--primary)',
              }}
            />
          </div>
          <span id="budgetStats" className="budget-stats" aria-live="polite">
            {metrics.budget > 0 ? (
              metrics.budgetRemaining < 0 ? (
                <span style={{ color: 'var(--danger)' }}>
                  Excedido por ${Math.abs(metrics.budgetRemaining).toFixed(2)} ({metrics.budgetPercentage}%)
                </span>
              ) : (
                <span>
                  Restante: ${metrics.budgetRemaining.toFixed(2)} ({metrics.budgetPercentage}% consumido)
                </span>
              )
            ) : (
              <span>Sin presupuesto asignado</span>
            )}
          </span>
        </div>

        <div className="stat-card chart-box">
          <span className="stat-label">Unidades por Categoría</span>
          <div
            id="categoryChart"
            ref={chartContainerRef}
            className="chart-canvas"
            role="img"
            aria-label="Gráfico interactivo de unidades pendientes por categoría y ubicación"
            style={{ width: '100%', height: '320px' }}
          />
        </div>

        <div className="stats-actions">
          <button
            id="resetListButton"
            className="btn btn-secondary btn-block"
            type="button"
            aria-label="Limpiar todos los productos marcados como comprados"
            disabled={completedCount === 0}
            onClick={onClearCompleted}
          >
            <Trash2 size={18} aria-hidden="true" />
            <span>Limpiar Comprados ({completedCount})</span>
          </button>
        </div>
      </aside>
    </section>
  );
};
