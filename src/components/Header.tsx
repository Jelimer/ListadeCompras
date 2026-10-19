import React from 'react';
import { Share2, Printer, Download, Upload, Moon, Sun, Receipt, Layers } from 'lucide-react';
import { formatMoney } from '../utils/formatters';

interface HeaderProps {
  isOnline: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenReceiptScanner: () => void;
  receiptsCount?: number;
  totalItemsCount?: number;
  pendingCount?: number;
  totalPendingAmount?: number;
  totalSpentAmount?: number;
  onOpenShare: () => void;
  onPrint: () => void;
  onExport: () => void;
  onImportClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  isOnline,
  theme,
  onToggleTheme,
  onOpenReceiptScanner,
  receiptsCount = 0,
  totalItemsCount = 0,
  pendingCount = 0,
  totalPendingAmount = 0,
  totalSpentAmount = 0,
  onOpenShare,
  onPrint,
  onExport,
  onImportClick,
  onFileChange,
}) => {
  return (
    <header role="banner" className="executive-header">
      <div className="brand">
        <div className="brand-title-row">
          <div className="brand-mark-box" aria-hidden="true">
            <Layers size={18} />
          </div>
          <div className="brand-copy-stack">
            <div className="brand-heading-inline">
              <h1>Lista de Compra</h1>
              <span className="brand-edition-tag">PRO</span>
              <div
                id="networkStatusBadge"
                className={`network-badge ${isOnline ? 'online' : 'offline'}`}
                role="status"
                aria-live="polite"
              >
                <span className="badge-dot"></span>
                <span className="badge-text">{isOnline ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <p className="brand-subtitle">
              Gestión corporativa de suministros · Auditoría de precios y logística
            </p>
          </div>
        </div>
      </div>

      {/* Cinta de métricas ejecutivas rápidas en escritorio */}
      <div className="header-executive-ledger" aria-label="Resumen ejecutivo rápido">
        <div className="ledger-metric-item">
          <span className="ledger-metric-label">Catálogo</span>
          <span className="ledger-metric-value tabular-nums">
            {totalItemsCount} <small>({pendingCount} pend.)</small>
          </span>
        </div>
        <span className="ledger-divider" aria-hidden="true" />
        <div className="ledger-metric-item">
          <span className="ledger-metric-label">Por Comprar</span>
          <span className="ledger-metric-value tabular-nums">${formatMoney(totalPendingAmount)}</span>
        </div>
        <span className="ledger-divider" aria-hidden="true" />
        <div className="ledger-metric-item">
          <span className="ledger-metric-label">Ejecutado</span>
          <span className="ledger-metric-value ledger-emerald tabular-nums">
            ${formatMoney(totalSpentAmount)}
          </span>
        </div>
      </div>

      <div className="header-actions">
        <button
          id="scanReceiptButton"
          className="btn-scan-ticket-header"
          type="button"
          aria-label="Subir foto de ticket o ver compras procesadas"
          title="Subir foto del ticket para procesar la compra hecha y sus precios"
          onClick={onOpenReceiptScanner}
        >
          <Receipt size={16} aria-hidden="true" />
          <span className="scan-ticket-label">Subir Ticket</span>
          {receiptsCount > 0 && (
            <span className="scan-ticket-count tabular-nums">{receiptsCount}</span>
          )}
        </button>

        <div className="header-utility-group" role="group" aria-label="Herramientas de documento">
          <button
            id="shareButton"
            className="icon-button"
            type="button"
            aria-label="Compartir lista"
            title="Compartir lista por WhatsApp o copiar"
            onClick={onOpenShare}
          >
            <Share2 size={18} aria-hidden="true" />
          </button>

          <button
            id="printButton"
            className="icon-button"
            type="button"
            aria-label="Imprimir lista"
            title="Imprimir o guardar en PDF"
            onClick={onPrint}
          >
            <Printer size={18} aria-hidden="true" />
          </button>

          <button
            id="exportButton"
            className="icon-button"
            type="button"
            aria-label="Exportar lista"
            title="Exportar lista (JSON / CSV)"
            onClick={onExport}
          >
            <Download size={18} aria-hidden="true" />
          </button>

          <button
            id="importButton"
            className="icon-button"
            type="button"
            aria-label="Importar lista"
            title="Importar lista (JSON / CSV)"
            onClick={onImportClick}
          >
            <Upload size={18} aria-hidden="true" />
          </button>
          <input
            type="file"
            id="importFileInput"
            accept=".json,.csv"
            style={{ display: 'none' }}
            aria-hidden="true"
            onChange={onFileChange}
          />

          <button
            id="themeToggle"
            className="icon-button"
            type="button"
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-pressed={theme === 'dark'}
            title="Cambiar Tema"
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? (
              <Sun size={18} aria-hidden="true" />
            ) : (
              <Moon size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
