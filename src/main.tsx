import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import '@/index.css';

async function bootstrap() {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const { worker } = await import('@/mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    });
  }

  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Elemento raiz da aplicação não encontrado.');
  }

  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap().catch((error: unknown) => {
  console.error('Não foi possível iniciar a aplicação.', error);
  const rootElement = document.getElementById('root');

  if (rootElement) {
    rootElement.textContent = 'Falha ao iniciar a aplicação. Consulte o console para detalhes.';
  }
});
