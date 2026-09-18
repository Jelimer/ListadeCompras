/**
 * js/chart.js
 * Controlador Adaptativo y Responsive de Apache ECharts para Lista de Compra | PRO.
 * Compatible con UMD (Navegadores y Node.js).
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.ShoppingChart = exports;
    root.ChartManager = exports;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // Paleta armónica accesible WCAG
  const COLOR_PALETTE = [
    '#4f46e5', // Indigo
    '#0ea5e9', // Sky
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f97316'  // Orange
  ];

  class ChartController {
    constructor(domElement, options = {}) {
      this.domElement = domElement;
      this.options = options;
      this.instance = null;
      this.resizeObserver = null;
      this._resizeTimeout = null;
      this.echartsLibrary = options.echarts || (typeof window !== 'undefined' ? window.echarts : null);

      this._init();
    }

    _init() {
      if (!this.domElement || !this.echartsLibrary) return;

      this.instance = this.echartsLibrary.init(this.domElement);

      if (typeof window !== 'undefined' && window.ResizeObserver) {
        this.resizeObserver = new window.ResizeObserver(() => {
          this.handleResizeDebounced();
        });
        this.resizeObserver.observe(this.domElement);
      }
    }

    handleResizeDebounced(delay = 100) {
      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        if (this.instance && !this.instance.disposed) {
          this.instance.resize();
        }
      }, delay);
    }

    render(breakdown = {}, allPendingItems = [], isDark = false) {
      if (!this.instance || this.instance.disposed) return;

      const locations = Object.keys(breakdown).sort();

      if (locations.length === 0) {
        this.instance.clear();
        return;
      }

      // Extraer categorías únicas ordenadas
      const catSet = new Set();
      locations.forEach(loc => {
        Object.keys(breakdown[loc] || {}).forEach(cat => catSet.add(cat));
      });
      const categories = Array.from(catSet).sort();

      if (categories.length === 0) {
        this.instance.clear();
        return;
      }

      const series = categories.map((cat, i) => ({
        name: cat,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 35,
        color: COLOR_PALETTE[i % COLOR_PALETTE.length],
        data: locations.map(loc => (breakdown[loc] && breakdown[loc][cat]) || 0),
        itemStyle: { borderRadius: 4 },
        label: {
          show: true,
          position: 'inside',
          formatter: (params) => params.value > 0 ? params.value : '',
          color: '#ffffff',
          fontSize: 10,
          fontWeight: 'bold'
        },
        emphasis: { focus: 'series' }
      }));

      const option = {
        tooltip: {
          trigger: 'item',
          confine: true, // Requisito crítico móvil para no desbordar viewport
          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          textStyle: {
            color: isDark ? '#f1f5f9' : '#1e293b',
            fontFamily: 'Plus Jakarta Sans, sans-serif'
          },
          formatter: (params) => {
            const loc = params.name;
            const cat = params.seriesName;
            const matchingItems = allPendingItems.filter(item => {
              const itemLoc = (item.location || 'General').trim() || 'General';
              const itemCat = (item.category || 'General').trim() || 'General';
              return itemLoc === loc && itemCat === cat && !item.completed;
            });

            const productList = matchingItems.map(item => `• ${item.name} (${item.quantity} un.)`).join('<br/>');
            const header = `<div style="font-weight:800; margin-bottom:4px; color:${params.color};">${loc} — ${cat}</div>`;
            const sub = `<div style="font-size:0.8rem; margin-bottom:6px; opacity:0.75;">${params.value} un. pendientes</div>`;
            const body = productList
              ? `<div style="font-size:0.82rem; border-top:1px solid rgba(128,128,128,0.2); padding-top:4px;">${productList}</div>`
              : '<i>Sin pendientes</i>';

            return `<div style="padding:4px 6px;">${header}${sub}${body}</div>`;
          }
        },
        legend: {
          type: 'scroll',
          bottom: '0%',
          textStyle: {
            color: isDark ? '#f8fafc' : '#0f172a',
            fontWeight: 'bold',
            fontSize: 11
          },
          itemWidth: 10,
          itemHeight: 10,
          pageIconColor: isDark ? '#f8fafc' : '#0f172a',
          pageTextStyle: { color: isDark ? '#94a3b8' : '#64748b' }
        },
        grid: {
          left: '3%',
          right: '5%',
          bottom: '15%',
          top: '5%',
          containLabel: true
        },
        xAxis: {
          type: 'value',
          minInterval: 1,
          splitLine: {
            lineStyle: {
              type: 'dashed',
              opacity: 0.15,
              color: isDark ? '#475569' : '#cbd5e1'
            }
          },
          axisLabel: {
            color: isDark ? '#94a3b8' : '#64748b',
            fontSize: 11
          }
        },
        yAxis: {
          type: 'category',
          data: locations,
          axisLabel: {
            color: isDark ? '#f8fafc' : '#0f172a',
            fontWeight: 'bold',
            fontSize: 11,
            width: 90,
            overflow: 'truncate'
          },
          axisLine: { show: false },
          axisTick: { show: false }
        },
        series: series
      };

      this.instance.setOption(option, true);
    }

    clear() {
      if (this.instance) {
        this.instance.clear();
      }
    }

    dispose() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.instance) {
        this.instance.dispose();
        this.instance = null;
      }
    }
  }

  return {
    ChartController,
    COLOR_PALETTE
  };
}));
