import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado al renderizar la aplicación.',
    };
  }

  handleRecover = () => {
    try {
      localStorage.removeItem('collapsedGroups');
      localStorage.removeItem('locationOrder');
      localStorage.removeItem('shopping_trips_data');
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            maxWidth: '480px',
            margin: '60px auto',
            padding: '24px',
            borderRadius: '16px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>
            Actualizando estructura de datos
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#64748b' }}>
            Se detectó un formato antiguo en la caché del navegador ({this.state.errorMessage}).
          </p>
          <button
            type="button"
            onClick={this.handleRecover}
            style={{
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 20px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reparar y Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
