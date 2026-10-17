import React, { useState } from 'react';
import { X, Copy, Check, MessageCircle, Share2 } from 'lucide-react';
import { ShoppingItem } from '../types';
import { formatShoppingList, shareShoppingList } from '../utils/share';

interface ShareModalProps {
  items: ShoppingItem[];
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ items, isOpen, onClose }) => {
  if (!isOpen) return null;

  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [includePrices, setIncludePrices] = useState(true);
  const [copied, setCopied] = useState(false);

  const formattedText = formatShoppingList(items, {
    includeCompleted,
    includePrices,
    title: 'Lista de Compras',
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleWhatsApp = () => {
    const encoded = encodeURIComponent(formattedText);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    await shareShoppingList(items, { includeCompleted, includePrices });
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Share2 size={20} aria-hidden="true" />
            <h3>Compartir Lista de Compras</h3>
          </div>
          <button type="button" className="modal-close-btn" aria-label="Cerrar ventana" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <label className="checkbox-container" style={{ fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(e) => setIncludeCompleted(e.target.checked)}
              />
              <span className="checkmark" />
              <span>Incluir comprados</span>
            </label>
            <label className="checkbox-container" style={{ fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={includePrices}
                onChange={(e) => setIncludePrices(e.target.checked)}
              />
              <span className="checkmark" />
              <span>Incluir precios</span>
            </label>
          </div>

          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              maxHeight: '220px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '13px',
              fontFamily: 'monospace',
              color: 'var(--text-main)',
            }}
          >
            {formattedText}
          </div>

          <div className="modal-actions-grid" style={{ marginTop: '16px' }}>
            <button type="button" className="btn btn-primary" onClick={handleWhatsApp}>
              <MessageCircle size={18} aria-hidden="true" />
              <span>WhatsApp</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleCopy}>
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
            </button>
            {canNativeShare && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ gridColumn: 'span 2' }}
                onClick={handleNativeShare}
              >
                <Share2 size={18} aria-hidden="true" />
                <span>Compartir en aplicaciones...</span>
              </button>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
