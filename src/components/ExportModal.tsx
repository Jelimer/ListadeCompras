import React from 'react';
import { X, FileCode, FileSpreadsheet } from 'lucide-react';
import { ShoppingItem } from '../types';
import { exportJSON, exportCSV } from '../utils/exportImport';

interface ExportModalProps {
  items: ShoppingItem[];
  budget: number;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ items, budget, isOpen, onClose }) => {
  if (!isOpen) return null;

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onClose();
  };

  const handleExportJSON = () => {
    const json = exportJSON(items, budget);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(json, `lista-compras-${dateStr}.json`, 'application/json');
  };

  const handleExportCSV = () => {
    const csv = exportCSV(items);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(csv, `lista-compras-${dateStr}.csv`, 'text/csv;charset=utf-8;');
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3>Exportar Lista</h3>
          </div>
          <button type="button" className="modal-close-btn" aria-label="Cerrar ventana" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-desc">
            Elige el formato en el que deseas exportar y guardar una copia de tu lista de compras:
          </p>

          <div className="modal-actions-grid" style={{ marginTop: '16px' }}>
            <button type="button" className="btn btn-primary" onClick={handleExportJSON}>
              <FileCode size={18} aria-hidden="true" />
              <span>Exportar como JSON (Completo)</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleExportCSV}>
              <FileSpreadsheet size={18} aria-hidden="true" />
              <span>Exportar como CSV (Excel)</span>
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
