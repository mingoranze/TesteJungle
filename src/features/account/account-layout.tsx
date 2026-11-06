import { useMutation } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import {
  ChartSpline,
  Download,
  Heart,
  LogOut,
  MapPin,
  ShoppingCart,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { StatusMessage } from '@/components/ui/status-message';
import { logout } from '@/features/session/api';
import { endLocalSession } from '@/features/session/session';
import { ApiError } from '@/lib/api-error';

const itemClass = 'relative flex h-[45px] shrink-0 items-center gap-3 whitespace-nowrap px-[15px] font-mono text-[15px] text-primary';

function NavItem({ to, icon: Icon, label }: { to: '/perfil' | '/perfil/carteiras' | '/perfil/favoritos'; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className={`${itemClass} hover:bg-raised`}
      activeProps={{
        'aria-current': 'page',
        className: 'before:absolute before:bg-primary max-lg:before:inset-x-0 max-lg:before:bottom-0 max-lg:before:h-0.5 lg:before:inset-y-0 lg:before:left-0 lg:before:w-1.5',
      }}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
      {label}
    </Link>
  );
}

/** Itens do menu do Figma fora do escopo da entrega: exibidos, mas sem simular navegação. */
function UnavailableItem({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span aria-disabled="true" title="Indisponível nesta demonstração" className={`${itemClass} cursor-not-allowed`}>
      <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
      {label}
      <span className="sr-only"> (indisponível nesta demonstração)</span>
    </span>
  );
}

export function AccountLayout() {
  const navigate = useNavigate();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await endLocalSession();
      await navigate({ to: '/', replace: true });
    },
  });

  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)] content-start gap-6 px-4 pb-16 pt-6 sm:px-6 lg:min-h-[calc(100svh-71px)] lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-7 lg:px-0 lg:pt-8">
      <aside className="h-fit min-w-0 bg-surface">
        <h1 className="px-2.5 pb-1 pt-2.5 font-mono text-lg font-bold max-lg:pb-2">Meu perfil</h1>
        <nav aria-label="Menu do perfil" className="flex overflow-x-auto lg:block">
          <NavItem to="/perfil" icon={UserRound} label="Dados do perfil" />
          <NavItem to="/perfil/carteiras" icon={MapPin} label="Carteiras" />
          <UnavailableItem icon={ShoppingCart} label="Atividade" />
          <NavItem to="/perfil/favoritos" icon={Heart} label="Lista de interesse" />
          <UnavailableItem icon={ChartSpline} label="Ofertas" />
          <UnavailableItem icon={Download} label="Arquivos baixados" />
          <UnavailableItem icon={TriangleAlert} label="Suporte" />
          <button
            type="button"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            className={`${itemClass} w-full font-bold hover:bg-raised disabled:opacity-60 lg:mt-0 lg:border-t lg:border-border`}
          >
            <LogOut aria-hidden="true" size={18} strokeWidth={1.5} />
            {logoutMutation.isPending ? 'Saindo…' : 'Sair'}
          </button>
        </nav>
        {logoutMutation.isError && (
          <StatusMessage role="alert" variant="error" className="m-3 text-xs">
            {logoutMutation.error instanceof ApiError
              ? logoutMutation.error.message
              : 'Não foi possível sair. Tente novamente.'}
          </StatusMessage>
        )}
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
