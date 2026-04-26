import './lib/nakiros-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import TokenSandbox from './components/_dev/TokenSandbox';
import './styles/globals.css';
import { i18nReady } from './i18n/index';

// Dev escape hatch: `?dev=tokens` renders the new-design token sandbox
// instead of the full app. Bypasses i18n boot, daemon connection, and
// preferences load — useful to validate Phase 0 OKLch tokens. Removed
// once `docs/refactoring/07-new-design-integration.md` lands.
const isTokenSandbox = new URLSearchParams(window.location.search).get('dev') === 'tokens';
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

if (isTokenSandbox) {
  root.render(
    <React.StrictMode>
      <TokenSandbox />
    </React.StrictMode>,
  );
} else {
  void i18nReady.then(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}
