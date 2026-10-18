import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Camera,
  UploadCloud,
  Receipt,
  Check,
  Plus,
  Trash2,
  Store,
  Calendar,
  Hash,
  Loader2,
  History,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Edit2,
  RotateCcw,
} from 'lucide-react';
import { ShoppingItem, ReceiptLineItem, PurchaseReceipt } from '../types';
import { processReceiptImage, findMatchingShoppingItem } from '../utils/receiptParser';
import { formatMoney, formatNumber, parseLocaleNumber } from '../utils/formatters';
import { formatSkuCode } from '../utils/storage';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ShoppingItem[];
  receipts: PurchaseReceipt[];
  distinctLocations: string[];
  distinctCategories: string[];
  onConfirmReceipt: (payload: {
    storeName: string;
    storeAddress: string;
    date: string;
    receiptNumber: string;
    items: ReceiptLineItem[];
    total: number;
    thumbnailDataUrl?: string;
    syncEditedNamesToList: boolean;
  }) => void;
  onUpdateReceipt?: (updatedReceipt: PurchaseReceipt) => void;
  onDeleteReceipt: (receiptId: string) => void;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  items,
  receipts,
  distinctLocations,
  distinctCategories,
  onConfirmReceipt,
  onUpdateReceipt,
  onDeleteReceipt,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parsed / Editable Receipt State
  const [hasParsedData, setHasParsedData] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | undefined>(undefined);
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toLocaleDateString('es-AR'));
  const [receiptNumber, setReceiptNumber] = useState('');
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);
  const [syncEditedNamesToList, setSyncEditedNamesToList] = useState(true);

  // History collapsible & inline edit state
  const [expandedReceiptIds, setExpandedReceiptIds] = useState<Record<string, boolean>>({});
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [editingReceiptDraft, setEditingReceiptDraft] = useState<PurchaseReceipt | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Sorted catalog of user's existing items for manual linking (#001, #002...)
  const sortedCatalogItems = useMemo(() => {
    return [...items].sort((a, b) => (a.seqNumber || 9999) - (b.seqNumber || 9999));
  }, [items]);

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return;
    setErrorMessage(null);
    setIsProcessing(true);
    setStatusMessage('Leyendo imagen del ticket...');

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      const result = await processReceiptImage(file, items, (msg) => setStatusMessage(msg));
      setStoreName(result.storeName || 'Comercio en Ticket');
      setStoreAddress(result.storeAddress || '');
      setReceiptDate(result.date || new Date().toLocaleDateString('es-AR'));
      setReceiptNumber(result.receiptNumber || '');
      setThumbnailDataUrl(result.thumbnailDataUrl);

      if (result.items.length > 0) {
        setLineItems(result.items);
      } else {
        setLineItems([
          {
            id: `rcpt_manual_${Date.now()}`,
            name: '',
            quantity: 1,
            unitPrice: result.total > 0 ? result.total : 0,
            lineTotal: result.total > 0 ? result.total : 0,
            category: 'General',
            included: true,
          },
        ]);
        setErrorMessage(
          'No se distinguieron líneas individuales con claridad. Puedes completarlas o ajustarlas abajo.'
        );
      }
      setHasParsedData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(
        `No se pudo procesar automáticamente la imagen (${msg}). Puedes cargar los ítems manualmente.`
      );
      setStoreName('General');
      setLineItems([
        {
          id: `rcpt_manual_${Date.now()}`,
          name: '',
          quantity: 1,
          unitPrice: 0,
          lineTotal: 0,
          category: 'General',
          included: true,
        },
      ]);
      setHasParsedData(true);
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleUpdateLineItem = (
    id: string,
    field: 'name' | 'quantity' | 'unitPrice' | 'category' | 'included' | 'matchedItemId',
    value: string | number | boolean
  ) => {
    setLineItems((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row };

        if (field === 'included') {
          updated.included = Boolean(value);
        } else if (field === 'matchedItemId') {
          const selectedId = String(value);
          if (!selectedId || selectedId === '__new__') {
            updated.matchedItemId = undefined;
            updated.matchedSkuCode = undefined;
          } else {
            const targetItem = items.find((it) => it.id === selectedId);
            if (targetItem) {
              updated.matchedItemId = targetItem.id;
              updated.matchedSkuCode =
                targetItem.skuCode || formatSkuCode(targetItem.seqNumber || 1);
              // Replace cryptic supermarket receipt name with the clean product name from user's list
              if (!updated.rawTicketName && updated.name.trim()) {
                updated.rawTicketName = updated.name;
              }
              updated.name = targetItem.name;
              if (targetItem.category) {
                updated.category = targetItem.category;
              }
            }
          }
        } else if (field === 'name') {
          updated.name = String(value);
          // Only auto-match if the user hasn't manually linked an item yet
          if (!updated.matchedItemId) {
            const match = findMatchingShoppingItem(updated.name, items);
            if (match) {
              updated.matchedItemId = match.id;
              updated.matchedSkuCode = match.skuCode;
            }
          }
        } else if (field === 'category') {
          updated.category = String(value);
        } else if (field === 'quantity') {
          const q = typeof value === 'number' ? value : parseLocaleNumber(String(value));
          updated.quantity = q > 0 ? q : 1;
          updated.lineTotal = Math.round(updated.quantity * updated.unitPrice * 100) / 100;
        } else if (field === 'unitPrice') {
          const p = typeof value === 'number' ? value : parseLocaleNumber(String(value));
          updated.unitPrice = p >= 0 ? p : 0;
          updated.lineTotal = Math.round(updated.quantity * updated.unitPrice * 100) / 100;
        }

        return updated;
      })
    );
  };

  const handleAddEmptyRow = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `rcpt_row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
        category: 'General',
        included: true,
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setLineItems((prev) => prev.filter((r) => r.id !== id));
  };

  const calculatedTotal = useMemo(() => {
    return lineItems
      .filter((r) => r.included && r.name.trim().length > 0)
      .reduce((acc, r) => acc + (Number(r.quantity) || 1) * (Number(r.unitPrice) || 0), 0);
  }, [lineItems]);

  const validIncludedItems = useMemo(() => {
    return lineItems.filter((r) => r.included && r.name.trim().length > 0);
  }, [lineItems]);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (validIncludedItems.length === 0) return;

    onConfirmReceipt({
      storeName: storeName.trim() || 'General',
      storeAddress: storeAddress.trim(),
      date: receiptDate.trim() || new Date().toLocaleDateString('es-AR'),
      receiptNumber: receiptNumber.trim(),
      items: validIncludedItems,
      total: Math.round(calculatedTotal * 100) / 100,
      thumbnailDataUrl,
      syncEditedNamesToList,
    });

    setHasParsedData(false);
    setLineItems([]);
    setPreviewUrl(null);
    onClose();
  };

  const toggleReceiptExpand = (id: string) => {
    setExpandedReceiptIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Start editing a saved receipt in History
  const startEditingReceipt = (rcpt: PurchaseReceipt) => {
    setExpandedReceiptIds((prev) => ({ ...prev, [rcpt.id]: true }));
    setEditingReceiptId(rcpt.id);
    setEditingReceiptDraft({
      ...rcpt,
      items: rcpt.items.map((it) => ({ ...it })),
    });
  };

  const handleDraftItemChange = (
    idx: number,
    field: 'name' | 'category' | 'quantity' | 'unitPrice',
    val: string
  ) => {
    if (!editingReceiptDraft) return;
    const nextItems = [...editingReceiptDraft.items];
    const current = { ...nextItems[idx] };

    if (field === 'name') {
      current.name = val;
    } else if (field === 'category') {
      current.category = val;
    } else if (field === 'quantity') {
      const q = parseLocaleNumber(val);
      current.quantity = q > 0 ? q : 1;
      current.lineTotal = Math.round(current.quantity * current.unitPrice * 100) / 100;
    } else if (field === 'unitPrice') {
      const p = parseLocaleNumber(val);
      current.unitPrice = p >= 0 ? p : 0;
      current.lineTotal = Math.round(current.quantity * current.unitPrice * 100) / 100;
    }

    nextItems[idx] = current;
    const newTotal = nextItems.reduce((acc, i) => acc + i.lineTotal, 0);

    setEditingReceiptDraft({
      ...editingReceiptDraft,
      items: nextItems,
      total: Math.round(newTotal * 100) / 100,
    });
  };

  const saveEditingReceipt = () => {
    if (!editingReceiptDraft || !onUpdateReceipt) return;
    onUpdateReceipt(editingReceiptDraft);
    setEditingReceiptId(null);
    setEditingReceiptDraft(null);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Escáner y seguimiento de tickets de compra"
    >
      <div className="modal-card receipt-modal-card">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Receipt size={20} aria-hidden="true" />
            <h3>Tickets de Compra y Seguimiento con Fechas</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Datalist con los nombres limpios de tu lista para autocompletar al corregir */}
        <datalist id="existing-product-names-list">
          {sortedCatalogItems.map((it) => (
            <option key={it.id} value={it.name}>
              {it.skuCode} · {it.location}
            </option>
          ))}
        </datalist>

        {/* Pestañas internas del Modal */}
        <div className="receipt-modal-tabs">
          <button
            type="button"
            className={`receipt-tab-btn ${activeTab === 'scan' ? 'active' : ''}`}
            onClick={() => setActiveTab('scan')}
          >
            <Camera size={16} aria-hidden="true" />
            <span>Subir / Escanear Ticket</span>
          </button>
          <button
            type="button"
            className={`receipt-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} aria-hidden="true" />
            <span>Historial de Tickets ({formatNumber(receipts.length, 0)})</span>
          </button>
        </div>

        <div className="modal-body receipt-modal-body">
          {activeTab === 'scan' ? (
            <>
              {/* Zona de Carga de Foto del Ticket */}
              <div
                className={`receipt-dropzone ${isProcessing ? 'is-loading' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) handleFileSelect(droppedFile);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleFileSelect(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleFileSelect(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />

                {isProcessing ? (
                  <div className="receipt-processing-box">
                    <Loader2 size={32} className="spin" aria-hidden="true" />
                    <strong>{statusMessage || 'Procesando foto del ticket...'}</strong>
                    <span>Extrayendo comercio, fecha, productos y precios unitarios</span>
                  </div>
                ) : (
                  <div className="receipt-upload-actions">
                    <div className="receipt-upload-info">
                      <Sparkles size={22} className="receipt-sparkle-icon" aria-hidden="true" />
                      <div>
                        <strong>Sube o toma una foto de tu ticket de compra</strong>
                        <p>
                          Cada supermercado usa su propia nomenclatura: abajo podrás corregir los nombres manualmente o vincular cada línea con tu producto (`#001`, `#002`...) antes de guardar.
                        </p>
                      </div>
                    </div>
                    <div className="receipt-upload-buttons">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UploadCloud size={18} aria-hidden="true" />
                        <span>Elegir foto / imagen</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera size={18} aria-hidden="true" />
                        <span>Usar Cámara</span>
                      </button>
                      {!hasParsedData && (
                        <button
                          type="button"
                          className="btn-collapse-section-inline"
                          onClick={() => {
                            setStoreName(distinctLocations[0] || 'General');
                            setLineItems([
                              {
                                id: `rcpt_manual_${Date.now()}`,
                                name: '',
                                quantity: 1,
                                unitPrice: 0,
                                lineTotal: 0,
                                category: 'General',
                                included: true,
                              },
                            ]);
                            setHasParsedData(true);
                          }}
                        >
                          Cargar ticket manualmente
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="receipt-alert-banner" role="alert">
                  {errorMessage}
                </div>
              )}

              {/* Formulario Editable de Revisión de Ticket */}
              {hasParsedData && !isProcessing && (
                <form className="receipt-review-form" onSubmit={handleConfirm}>
                  <div className="receipt-meta-grid">
                    {previewUrl && (
                      <div className="receipt-thumb-box">
                        <img src={previewUrl} alt="Vista previa del ticket" />
                      </div>
                    )}
                    <div className="receipt-meta-fields">
                      <div className="receipt-field-group">
                        <label htmlFor="receiptStoreInput">
                          <Store size={14} aria-hidden="true" /> Comercio / Supermercado
                        </label>
                        <input
                          id="receiptStoreInput"
                          type="text"
                          list="location-suggestions"
                          placeholder="Ej: Carrefour, Facor..."
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          required
                        />
                      </div>

                      <div className="receipt-field-group">
                        <label htmlFor="receiptDateInput">
                          <Calendar size={14} aria-hidden="true" /> Fecha de Compra
                        </label>
                        <input
                          id="receiptDateInput"
                          type="text"
                          placeholder="DD/MM/AAAA"
                          value={receiptDate}
                          onChange={(e) => setReceiptDate(e.target.value)}
                        />
                      </div>

                      <div className="receipt-field-group">
                        <label htmlFor="receiptNumInput">
                          <Hash size={14} aria-hidden="true" /> N° Ticket (opcional)
                        </label>
                        <input
                          id="receiptNumInput"
                          type="text"
                          placeholder="Ej: 0004-00128940"
                          value={receiptNumber}
                          onChange={(e) => setReceiptNumber(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Aviso de Corrección Manual de Nomenclatura */}
                  <div className="receipt-nomenclature-hint">
                    <span>
                      💡 <strong>Corrección de nombres por supermercado:</strong> Si el ticket tiene abreviaturas (ej. <em>"GALLET TERRAB"</em>), elige a qué producto de tu lista corresponde en <strong>Vincular #ID</strong> o edita el nombre directamente en la columna <strong>Nombre del Producto</strong>.
                    </span>
                  </div>

                  {/* Tabla Editable de Productos Detectados */}
                  <div className="receipt-items-header">
                    <h4>
                      Productos del ticket ({formatNumber(validIncludedItems.length, 0)})
                    </h4>
                    <button
                      type="button"
                      className="btn-collapse-section-inline"
                      onClick={handleAddEmptyRow}
                    >
                      <Plus size={14} aria-hidden="true" />
                      <span>Agregar fila al ticket</span>
                    </button>
                  </div>

                  <div className="receipt-items-table-wrap">
                    <table className="kpi-audit-table receipt-edit-table tabular-nums">
                      <thead>
                        <tr>
                          <th>Inc.</th>
                          <th>Vincular con tu Lista (#ID)</th>
                          <th>Nombre del Producto (Editable)</th>
                          <th>Cant.</th>
                          <th>Precio Unit. ($)</th>
                          <th>Categoría</th>
                          <th className="num-col">Subtotal</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((row) => {
                          const rowSubtotal =
                            (Number(row.quantity) || 1) * (Number(row.unitPrice) || 0);
                          const linkedItem = row.matchedItemId
                            ? items.find((i) => i.id === row.matchedItemId)
                            : undefined;

                          return (
                            <tr key={row.id} className={!row.included ? 'audit-row-completed' : ''}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.included}
                                  onChange={(e) =>
                                    handleUpdateLineItem(row.id, 'included', e.target.checked)
                                  }
                                  aria-label={`Incluir ${row.name}`}
                                />
                              </td>
                              <td>
                                <select
                                  className={`receipt-link-select ${
                                    row.matchedItemId ? 'is-linked' : 'is-new'
                                  }`}
                                  value={row.matchedItemId || '__new__'}
                                  onChange={(e) =>
                                    handleUpdateLineItem(row.id, 'matchedItemId', e.target.value)
                                  }
                                  aria-label="Vincular con producto existente o crear nuevo"
                                >
                                  <option value="__new__">+ Nuevo producto (#ID)</option>
                                  {sortedCatalogItems.map((catItem) => {
                                    const code =
                                      catItem.skuCode || formatSkuCode(catItem.seqNumber || 1);
                                    return (
                                      <option key={catItem.id} value={catItem.id}>
                                        {code} — {catItem.name} ({catItem.location})
                                      </option>
                                    );
                                  })}
                                </select>
                              </td>
                              <td>
                                <div className="receipt-name-cell-stack">
                                  <input
                                    type="text"
                                    className="receipt-row-input receipt-name-input"
                                    list="existing-product-names-list"
                                    placeholder="Escribe o corrige el nombre del producto..."
                                    value={row.name}
                                    onChange={(e) =>
                                      handleUpdateLineItem(row.id, 'name', e.target.value)
                                    }
                                  />
                                  {row.rawTicketName &&
                                    row.rawTicketName.trim().toLowerCase() !==
                                      row.name.trim().toLowerCase() && (
                                      <div className="receipt-raw-ticket-caption">
                                        <span>Ticket: &ldquo;{row.rawTicketName}&rdquo;</span>
                                        <button
                                          type="button"
                                          className="btn-restore-raw-name"
                                          title="Usar texto original impreso en el ticket"
                                          onClick={() =>
                                            handleUpdateLineItem(
                                              row.id,
                                              'name',
                                              row.rawTicketName || ''
                                            )
                                          }
                                        >
                                          Usar texto ticket
                                        </button>
                                      </div>
                                    )}
                                  {linkedItem &&
                                    linkedItem.name.trim().toLowerCase() !==
                                      row.name.trim().toLowerCase() && (
                                      <div className="receipt-raw-ticket-caption">
                                        <span>
                                          En tu lista ({row.matchedSkuCode}): &ldquo;{linkedItem.name}&rdquo;
                                        </span>
                                        <button
                                          type="button"
                                          className="btn-restore-raw-name"
                                          onClick={() =>
                                            handleUpdateLineItem(row.id, 'name', linkedItem.name)
                                          }
                                        >
                                          Usar nombre de {row.matchedSkuCode}
                                        </button>
                                      </div>
                                    )}
                                </div>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="receipt-row-input receipt-qty-input"
                                  min="0.01"
                                  step="any"
                                  value={row.quantity}
                                  onChange={(e) =>
                                    handleUpdateLineItem(row.id, 'quantity', e.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="receipt-row-input receipt-price-input"
                                  min="0"
                                  step="0.01"
                                  value={row.unitPrice}
                                  onChange={(e) =>
                                    handleUpdateLineItem(row.id, 'unitPrice', e.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="receipt-row-input receipt-cat-input"
                                  list="category-suggestions"
                                  value={row.category}
                                  onChange={(e) =>
                                    handleUpdateLineItem(row.id, 'category', e.target.value)
                                  }
                                />
                              </td>
                              <td className="num-col font-bold">{formatMoney(rowSubtotal)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn-item-action btn-delete-item"
                                  title="Quitar fila"
                                  onClick={() => handleRemoveRow(row.id)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="receipt-confirm-bar">
                    <div className="receipt-confirm-left">
                      <div className="receipt-total-summary tabular-nums">
                        <span>
                          Total del Ticket ({formatNumber(validIncludedItems.length, 0)} art.):
                        </span>
                        <strong>{formatMoney(calculatedTotal)}</strong>
                      </div>
                      <label className="receipt-sync-names-check">
                        <input
                          type="checkbox"
                          checked={syncEditedNamesToList}
                          onChange={(e) => setSyncEditedNamesToList(e.target.checked)}
                        />
                        <span>
                          Actualizar también el nombre en mi lista principal si lo corregí manualmente
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={validIncludedItems.length === 0}
                    >
                      <Check size={18} aria-hidden="true" />
                      <span>Confirmar Compra con Fecha ({receiptDate || 'Hoy'})</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            /* Pestaña 2: Historial de Tickets Procesados (Con Edición Manual de Nombres y Precios) */
            <div className="receipt-history-list">
              {receipts.length === 0 ? (
                <div className="empty-state">
                  <Receipt size={42} className="empty-icon" aria-hidden="true" />
                  <h3>Aún no has registrado tickets de compra</h3>
                  <p>
                    Sube la foto de un ticket en la pestaña "Subir / Escanear Ticket" para llevar el registro con fecha de cada compra, comercio y precio pagado.
                  </p>
                </div>
              ) : (
                receipts.map((rcpt) => {
                  const isExpanded = Boolean(expandedReceiptIds[rcpt.id]);
                  const isEditingThis =
                    editingReceiptId === rcpt.id && editingReceiptDraft !== null;

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
                              📅 {rcpt.date}
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
                          {onUpdateReceipt && !isEditingThis && (
                            <button
                              type="button"
                              className="btn-item-action"
                              title="Editar nombres de productos, fecha o precios de este ticket"
                              onClick={() => startEditingReceipt(rcpt)}
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-item-action btn-delete-item"
                            title="Eliminar registro de ticket"
                            onClick={() => onDeleteReceipt(rcpt.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="receipt-history-items">
                          {isEditingThis && editingReceiptDraft ? (
                            <div className="receipt-history-edit-box">
                              <div className="receipt-meta-fields" style={{ marginBottom: '10px' }}>
                                <div className="receipt-field-group">
                                  <label>Comercio</label>
                                  <input
                                    type="text"
                                    list="location-suggestions"
                                    value={editingReceiptDraft.storeName}
                                    onChange={(e) =>
                                      setEditingReceiptDraft({
                                        ...editingReceiptDraft,
                                        storeName: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="receipt-field-group">
                                  <label>Fecha de Compra</label>
                                  <input
                                    type="text"
                                    value={editingReceiptDraft.date}
                                    onChange={(e) =>
                                      setEditingReceiptDraft({
                                        ...editingReceiptDraft,
                                        date: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>

                              <table className="kpi-audit-table tabular-nums">
                                <thead>
                                  <tr>
                                    <th>#ID</th>
                                    <th>Nombre del Producto (Corregir)</th>
                                    <th>Categoría</th>
                                    <th className="num-col">Cant.</th>
                                    <th className="num-col">Precio Unit.</th>
                                    <th className="num-col">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {editingReceiptDraft.items.map((it, idx) => (
                                    <tr key={idx}>
                                      <td>
                                        <span className="item-sku-code">
                                          {it.skuCode || `#${String(idx + 1).padStart(3, '0')}`}
                                        </span>
                                      </td>
                                      <td>
                                        <input
                                          type="text"
                                          className="receipt-row-input"
                                          list="existing-product-names-list"
                                          value={it.name}
                                          onChange={(e) =>
                                            handleDraftItemChange(idx, 'name', e.target.value)
                                          }
                                        />
                                      </td>
                                      <td>
                                        <input
                                          type="text"
                                          className="receipt-row-input receipt-cat-input"
                                          list="category-suggestions"
                                          value={it.category}
                                          onChange={(e) =>
                                            handleDraftItemChange(idx, 'category', e.target.value)
                                          }
                                        />
                                      </td>
                                      <td className="num-col">
                                        <input
                                          type="number"
                                          step="any"
                                          className="receipt-row-input receipt-qty-input"
                                          value={it.quantity}
                                          onChange={(e) =>
                                            handleDraftItemChange(idx, 'quantity', e.target.value)
                                          }
                                        />
                                      </td>
                                      <td className="num-col">
                                        <input
                                          type="number"
                                          step="0.01"
                                          className="receipt-row-input receipt-price-input"
                                          value={it.unitPrice}
                                          onChange={(e) =>
                                            handleDraftItemChange(idx, 'unitPrice', e.target.value)
                                          }
                                        />
                                      </td>
                                      <td className="num-col font-bold">
                                        {formatMoney(it.lineTotal)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'flex-end',
                                  gap: '8px',
                                  marginTop: '10px',
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => {
                                    setEditingReceiptId(null);
                                    setEditingReceiptDraft(null);
                                  }}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={saveEditingReceipt}
                                >
                                  <Check size={14} /> Guardar Cambios
                                </button>
                              </div>
                            </div>
                          ) : (
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
                                    <td className="font-bold">
                                      {it.name}
                                      {it.rawTicketName &&
                                        it.rawTicketName.toLowerCase() !==
                                          it.name.toLowerCase() && (
                                          <small className="unit-price-sub">
                                            {' '}
                                            (Ticket: {it.rawTicketName})
                                          </small>
                                        )}
                                    </td>
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
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
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
