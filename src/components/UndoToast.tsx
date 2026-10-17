import React, { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { UndoAction } from '../types';

interface UndoToastProps {
  lastAction: UndoAction | null;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({ lastAction, onUndo, onDismiss }) => {
  useEffect(() => {
    if (!lastAction) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 6000);
    return () => clearTimeout(timer);
  }, [lastAction, onDismiss]);

  if (!lastAction) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'var(--card-bg)',
        color: 'var(--text-main)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 9999,
        maxWidth: '90vw',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 500 }}>{lastAction.description}</span>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        style={{ padding: '4px 10px', fontSize: '12px' }}
        onClick={onUndo}
      >
        <RotateCcw size={14} style={{ marginRight: '4px' }} />
        <span>Deshacer</span>
      </button>
      <button
        type="button"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
        }}
        onClick={onDismiss}
        aria-label="Cerrar notificación"
      >
        <X size={16} />
      </button>
    </div>
  );
};
