import React, { useState, useEffect, useRef } from 'react';
import { MapPin, X, Search, Check, Crosshair } from 'lucide-react';
import { StoredStoreCoordinate } from '../types';
import { geocodeAddress } from '../utils/mapRoute';
import { loadStoredCoordinates, saveStoreCoordinate, removeStoreCoordinate } from '../utils/storage';

interface ModalEditStoreLocationProps {
  storeName: string | null;
  onClose: () => void;
  onStartMapPicker: (storeName: string) => void;
  onLocationSaved: () => void;
}

export const ModalEditStoreLocation: React.FC<ModalEditStoreLocationProps> = ({
  storeName,
  onClose,
  onStartMapPicker,
  onLocationSaved,
}) => {
  const modalCardRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!storeName) return;
    const prevActive = document.activeElement as HTMLElement | null;
    if (inputRef.current) {
      inputRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalCardRef.current) {
        const focusable = Array.from(
          modalCardRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (prevActive && typeof prevActive.focus === 'function') {
        prevActive.focus();
      }
    };
  }, [storeName, onClose]);

  if (!storeName) return null;

  const stored = loadStoredCoordinates();
  const currentCoord: StoredStoreCoordinate | undefined = stored[storeName.toLowerCase().trim()];

  const [addressInput, setAddressInput] = useState(currentCoord?.address || '');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSearchAndSave = async () => {
    if (!addressInput.trim()) return;
    setLoading(true);
    setStatusMessage('Buscando coordenadas...');
    const result = await geocodeAddress(addressInput.trim());
    setLoading(false);

    if (result && result.lat && result.lng) {
      saveStoreCoordinate(storeName, {
        lat: result.lat,
        lng: result.lng,
        address: result.address || addressInput.trim(),
        displayName: storeName,
        source: 'manual',
      });
      setStatusMessage('¡Ubicación guardada con éxito!');
      onLocationSaved();
      setTimeout(onClose, 800);
    } else {
      setStatusMessage('No se pudo encontrar la dirección. Intenta seleccionarla en el mapa.');
    }
  };

  const handleResetLocation = () => {
    removeStoreCoordinate(storeName);
    onLocationSaved();
    onClose();
  };

  const handlePickOnMap = () => {
    onClose();
    onStartMapPicker(storeName);
  };

  return (
    <div
      id="modal-edit-store-location"
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-store-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" ref={modalCardRef}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <MapPin size={20} aria-hidden="true" />
            <h3 id="modal-store-title">Ubicación de {storeName}</h3>
          </div>
          <button
            type="button"
            id="btn-close-store-modal"
            className="modal-close-btn"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-desc">
            Indica la dirección precisa de este comercio o márcalo directamente en el mapa para ubicarlo con total exactitud:
          </p>

          <div className="input-group">
            <label htmlFor="input-store-address" className="input-label">
              Dirección exacta / Calle y altura
            </label>
            <div className="input-wrapper">
              <Search className="input-icon" size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                id="input-store-address"
                placeholder="Ej: Av. 3 de Abril 1200, Corrientes"
                autoComplete="off"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearchAndSave();
                }}
              />
            </div>
          </div>

          <div className="modal-coords-status" id="modal-current-coords-text">
            {currentCoord ? (
              <span style={{ color: 'var(--success)', fontSize: '13px' }}>
                Coordenadas actuales: {currentCoord.lat.toFixed(5)}, {currentCoord.lng.toFixed(5)}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Ubicación automática por defecto.
              </span>
            )}
            {statusMessage && (
              <div style={{ marginTop: '6px', fontSize: '13px', fontWeight: 500 }}>
                {statusMessage}
              </div>
            )}
          </div>

          <div className="modal-actions-grid">
            <button
              type="button"
              id="btn-search-store-address"
              className="btn btn-primary"
              disabled={loading || !addressInput.trim()}
              onClick={handleSearchAndSave}
            >
              <Check size={18} aria-hidden="true" />
              <span>{loading ? 'Buscando...' : 'Buscar y Guardar'}</span>
            </button>
            <button
              type="button"
              id="btn-pick-on-map-from-modal"
              className="btn btn-secondary"
              onClick={handlePickOnMap}
            >
              <Crosshair size={18} aria-hidden="true" />
              <span>Elegir en el mapa</span>
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            id="btn-reset-store-location"
            className="btn btn-sm btn-danger-outline"
            title="Restablecer ubicación original"
            onClick={handleResetLocation}
          >
            Restablecer por defecto
          </button>
          <button
            type="button"
            id="btn-cancel-store-modal"
            className="btn btn-sm btn-secondary"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
