const AUTH_PATHS = ['/login', '/cadastro'];
const PRIVATE_PREFIXES = ['/perfil'];

/**
 * Aceita somente caminhos relativos da própria aplicação, evitando redirecionamento aberto
 * (`//dominio`, `https://...`, `javascript:`) e laços para as telas de autenticação.
 */
export function safeRedirect(value: unknown, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  const pathname = value.split(/[?#]/)[0];
  return AUTH_PATHS.includes(pathname) ? fallback : value;
}

export function isPrivatePath(path: string) {
  const pathname = path.split(/[?#]/)[0];
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export interface AuthSearch {
  redirect?: string;
  reason?: 'expired';
}

export function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  const redirect = safeRedirect(search.redirect, '');
  return {
    ...(redirect ? { redirect } : {}),
    ...(search.reason === 'expired' ? { reason: 'expired' as const } : {}),
  };
}
