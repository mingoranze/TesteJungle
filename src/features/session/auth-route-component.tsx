import { useSearch } from '@tanstack/react-router';
import { AuthPage } from '@/features/session/auth-page';

export function LoginRouteView() {
  const search = useSearch({ from: '/login' });
  return <AuthPage key="login" mode="login" search={search} />;
}

export function RegisterRouteView() {
  const search = useSearch({ from: '/cadastro' });
  return <AuthPage key="register" mode="register" search={search} />;
}
