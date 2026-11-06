/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_MOCKS: string;
  readonly VITE_API_BASE_URL?: string;
  /** Origem do servidor Socket.IO; vazio usa a mesma origem (mock MSW na demonstração). */
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
