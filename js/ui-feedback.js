/**
 * js/ui-feedback.js
 * Módulo de Notificaciones, Confirmaciones Seguras (SweetAlert2) y Toast con Deshacer (Undo).
 * Compatible con UMD (Navegadores y Node.js).
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.ShoppingFeedback = exports;
    root.UIFeedback = exports;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  function getSwal() {
    if (typeof window !== 'undefined' && window.Swal) {
      return window.Swal;
    }
    return null;
  }

  function isDarkMode() {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    }
    return false;
  }

  /**
   * Diálogo de confirmación amigable antes de eliminar los productos comprados.
   * @param {number} count - Cantidad de productos comprados
   * @returns {Promise<boolean>} true si el usuario confirma
   */
  async function confirmClearCompleted(count = 0) {
    const Swal = getSwal();
    if (!Swal) {
      return typeof window !== 'undefined' && window.confirm ? window.confirm(`¿Deseas eliminar los ${count} productos comprados de la lista?`) : true;
    }

    const dark = isDarkMode();
    const result = await Swal.fire({
      title: '¿Limpiar comprados?',
      text: count > 0 
        ? `Se eliminarán ${count} producto(s) marcado(s) como comprado(s). Podrás deshacer esta acción si lo necesitas.` 
        : '¿Deseas limpiar los productos comprados?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar',
      cancelButtonText: 'Cancelar',
      background: dark ? '#1e293b' : '#ffffff',
      color: dark ? '#f8fafc' : '#0f172a',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true
    });

    return Boolean(result.isConfirmed);
  }

  /**
   * Diálogo al importar para elegir entre combinar o sustituir la lista.
   * @param {number} count - Cantidad de productos a importar
   * @returns {Promise<'merge'|'overwrite'|'cancel'>}
   */
  async function confirmImportMode(count = 0) {
    const Swal = getSwal();
    if (!Swal) {
      const ok = typeof window !== 'undefined' && window.confirm ? window.confirm(`Se encontraron ${count} productos. ¿Deseas agregarlos a tu lista actual?`) : true;
      return ok ? 'merge' : 'cancel';
    }

    const dark = isDarkMode();
    const result = await Swal.fire({
      title: 'Importar Lista',
      text: `Se encontraron ${count} productos en el archivo. ¿Cómo deseas importarlos?`,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Combinar con mi lista',
      denyButtonText: 'Sustituir todo',
      cancelButtonText: 'Cancelar',
      background: dark ? '#1e293b' : '#ffffff',
      color: dark ? '#f8fafc' : '#0f172a',
      confirmButtonColor: '#4f46e5',
      denyButtonColor: '#b45309',
      cancelButtonColor: '#64748b'
    });

    if (result.isConfirmed) return 'merge';
    if (result.isDenied) return 'overwrite';
    return 'cancel';
  }

  function showToast(message, type = 'info') {
    const Swal = getSwal();
    if (!Swal) return;

    const dark = isDarkMode();
    Swal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      icon: type,
      title: message,
      background: dark ? '#1e293b' : '#ffffff',
      color: dark ? '#f8fafc' : '#0f172a'
    });
  }

  let activeUndoTimer = null;
  let activeToastElement = null;

  /**
   * Muestra un Toast con temporizador y botón "Deshacer".
   * @param {string} message - Descripción de la acción realizada
   * @param {Function} onUndo - Callback a ejecutar si el usuario hace clic en Deshacer
   * @param {number} [duration=7000] - Tiempo en ms antes de auto-descartar
   */
  function showUndoToast(message, onUndo, duration = 7000) {
    if (typeof document === 'undefined') return;

    // Remover toast previo si existía
    dismissUndoToast();

    let container = document.getElementById('undoToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'undoToastContainer';
      container.className = 'undo-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="undo-toast-msg">${message}</span>
      <button class="btn-undo" type="button" aria-label="Deshacer acción">Deshacer</button>
    `;

    const undoBtn = toast.querySelector('.btn-undo');
    undoBtn.addEventListener('click', () => {
      dismissUndoToast();
      if (typeof onUndo === 'function') {
        onUndo();
      }
    });

    container.appendChild(toast);
    activeToastElement = toast;

    activeUndoTimer = setTimeout(() => {
      dismissUndoToast();
    }, duration);
  }

  function dismissUndoToast() {
    if (activeUndoTimer) {
      clearTimeout(activeUndoTimer);
      activeUndoTimer = null;
    }
    if (activeToastElement && activeToastElement.parentNode) {
      activeToastElement.parentNode.removeChild(activeToastElement);
      activeToastElement = null;
    }
  }

  return {
    confirmClearCompleted,
    confirmImportMode,
    showToast,
    showUndoToast,
    dismissUndoToast
  };
}));
