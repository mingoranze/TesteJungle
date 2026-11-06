import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Heart, House, LogIn, ScanLine, Search, ShoppingCart, UserRound, X } from 'lucide-react';
import { cartUnitCount, useCart } from '@/features/cart/use-cart';
import { dismissRealtimeNotice, useRealtimeNotices } from '@/features/realtime/realtime-notices';
import { useMarketplaceRealtime } from '@/features/realtime/use-marketplace-realtime';
import { useAuthenticatedSession } from '@/features/session/session';

const socialLinks = ['f', '◎', '♥', 'in', '▶'];

export function SiteShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isNftDetail = pathname.startsWith('/nfts/');
  const isAuthRoute = pathname === '/login' || pathname === '/cadastro';
  const isCart = pathname === '/carrinho';
  const isCheckout = pathname === '/pagamento';
  const isOrder = pathname.startsWith('/pedidos/');
  const isMarket = isNftDetail || isCart || isCheckout || isOrder;
  // Pagamento mobile tem cabeçalho próprio e botão fixo de confirmação (frame "Pagamento com carteira").
  const hideMobileChrome = isNftDetail || isAuthRoute || isCart || isCheckout;
  const session = useAuthenticatedSession();
  const cartCount = cartUnitCount(useCart().data);
  const cartLabel = `Carrinho, ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`;
  useMarketplaceRealtime();

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>

      <header className="hidden border-b border-border md:block">
        <div className="mx-auto flex h-[70px] w-full max-w-[1200px] items-center justify-between">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="rounded-sm font-mono text-xs font-bold tracking-[0.18em] text-foreground focus-visible:outline"
            aria-label="Kurio — início"
          >
            KURIO
          </Link>
          <nav aria-label="Navegação principal" className="flex h-full items-center gap-8 font-mono text-sm">
            <Link
              to="/"
              className={`flex h-full items-center border-b-2 px-1 ${pathname === '/' ? 'border-primary font-semibold text-primary' : 'border-transparent hover:text-primary'}`}
            >
              Início
            </Link>
            <Link
              to="/"
              hash="catalogo"
              aria-current={isMarket ? 'page' : undefined}
              className={`flex h-full items-center border-b-2 px-1 ${isMarket ? 'border-primary font-semibold text-primary' : 'border-transparent hover:text-primary'}`}
            >
              Mercado
            </Link>
            <a href="#destaques" className="flex h-full items-center px-1 hover:text-primary">Criadores</a>
            <a href="#diario" className="flex h-full items-center px-1 hover:text-primary">Aprenda</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="#catalogo" aria-label="Buscar NFTs" className="grid size-9 place-items-center rounded hover:text-primary">
              <Search aria-hidden="true" size={18} />
            </a>
            <Link to="/carrinho" aria-label={cartLabel} className="relative grid size-9 place-items-center rounded hover:text-primary">
              <ShoppingCart aria-hidden="true" size={18} />
              {cartCount > 0 && (
                <span
                  aria-hidden="true"
                  data-testid="cart-count"
                  className="absolute right-0 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-canvas"
                >
                  {cartCount}
                </span>
              )}
            </Link>
            {session ? (
              <Link
                to="/perfil"
                className="inline-flex min-h-9 items-center gap-1 rounded bg-primary px-3 font-mono text-sm font-bold text-canvas hover:bg-accent"
              >
                <UserRound aria-hidden="true" size={15} />
                Perfil
              </Link>
            ) : (
              <Link
                to="/login"
                search={pathname === '/' || isAuthRoute ? {} : { redirect: pathname }}
                className="inline-flex min-h-9 items-center gap-1 rounded bg-primary px-3 font-mono text-sm font-bold text-canvas hover:bg-accent"
              >
                <LogIn aria-hidden="true" size={15} />
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      <RealtimeNotices />

      <main id="main-content" className={`flex flex-1 flex-col ${hideMobileChrome ? 'pb-0' : 'pb-24 lg:pb-0'}`} tabIndex={-1}>
        <Outlet />
      </main>

      <footer
        data-testid="site-footer"
        className={`mt-auto bg-surface pb-24 lg:pb-0 ${isNftDetail ? 'hidden lg:block' : ''} ${isAuthRoute || isCart ? 'hidden md:block' : ''}`}
      >
        <section className="mx-auto hidden w-full max-w-[1200px] grid-cols-2 gap-5 py-6 md:grid lg:grid-cols-4">
          <article className="flex gap-4 border-r border-primary/70 pr-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-mono text-xl font-bold text-canvas">W</span>
            <div>
              <h2 className="font-bold">Segurança da carteira</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">Proteja sua carteira e colecione arte digital verificada com confiança.</p>
            </div>
          </article>
          <article className="flex gap-4 border-r border-primary/70 pr-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-mono text-xl font-bold text-canvas">C</span>
            <div>
              <h2 className="font-bold">Criadores em destaque</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.</p>
            </div>
          </article>
          <article className="flex gap-4 border-r border-primary/70 pr-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-mono text-xl font-bold text-canvas">D</span>
            <div>
              <h2 className="font-bold">Alertas de lançamentos</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.</p>
            </div>
          </article>
          <form className="flex flex-col justify-center">
            <label htmlFor="footer-newsletter" className="font-bold">Antecipe-se ao próximo lançamento</label>
            <div className="mt-3 flex">
              <input id="footer-newsletter" type="email" placeholder="digite seu e-mail..." className="min-w-0 flex-1 rounded-l bg-canvas px-3 py-2 text-xs transition-colors placeholder:text-secondary outline-none hover:bg-raised focus:bg-raised focus:outline-none focus-visible:outline-none" />
              <button type="button" className="rounded-r bg-primary px-3 text-sm font-bold text-canvas transition-colors outline-none hover:bg-accent focus:outline-none focus-visible:bg-accent focus-visible:outline-none active:bg-accent">Enviar</button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-secondary">Receba lançamentos selecionados, histórias de criadores e novidades do mercado.</p>
          </form>
        </section>

        <div className="hidden bg-[#3b2411] lg:block">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-4 py-5 font-mono text-sm lg:grid-cols-4">
            <span className="font-bold tracking-[0.16em]">KURIO</span>
            <span className="text-center">Feito para colecionadores,<br />criadores e cultura.</span>
            <a className="text-center" href="mailto:contato@email.com">contato@email.com</a>
            <a className="text-center" href="tel:+551140028922">+55 11 4002 8922</a>
          </div>
        </div>

        <div className="mx-auto hidden w-full max-w-[1200px] grid-cols-2 gap-8 py-6 md:grid lg:grid-cols-4">
          <FooterColumn title="Meu perfil" links={['Meu perfil', 'Minha coleção', 'Atividade', 'Estúdio do criador', 'Lista de interesse']} />
          <FooterColumn title="Central de ajuda" links={['Central de ajuda', 'Como comprar NFTs', 'Carteira e segurança', 'Política do mercado', 'Denunciar item']} />
          <FooterColumn title="Coleções" links={['Arte digital', 'Fotografia', 'Música', 'Arte 3D', 'Utilidade']} />
          <section>
            <h2 className="font-bold">Redes sociais</h2>
            <div className="mt-3 flex gap-2">
              {socialLinks.map((social) => (
                <a key={social} href="#destaques" aria-label={`Rede social ${social}`} className="grid size-8 place-items-center rounded border border-primary text-sm font-bold text-primary">
                  {social}
                </a>
              ))}
            </div>
            <h3 className="mt-5 font-bold">Carteiras compatíveis</h3>
            <p className="mt-2 text-xs text-primary">METAMASK · WALLETCONNECT · COINBASE</p>
          </section>
        </div>
        <p className="border-t border-border py-3 text-center font-mono text-xs text-secondary lg:border-0">
          © 2026 Kurio. Propriedade digital para todos.
        </p>
        <p className="px-4 pb-4 text-center text-xs text-secondary lg:hidden">
          <Link to="/foundation" search={{ scenario: 'baseline' }}>Ambiente de demonstração</Link>
        </p>
      </footer>

      {!hideMobileChrome && (
        <nav
          aria-label="Navegação móvel"
          className="fixed inset-x-0 bottom-0 z-40 grid h-[94px] grid-cols-5 items-center rounded-t-[2rem] bg-surface px-5 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 md:hidden"
        >
          <Link to="/" activeOptions={{ exact: true }} aria-label="Início" className="grid min-h-12 place-items-center text-primary">
            <House aria-hidden="true" size={20} fill="currentColor" />
          </Link>
          <Link
            to="/perfil/favoritos"
            aria-label="Favoritos"
            className="grid min-h-12 place-items-center"
            activeProps={{ className: 'text-primary' }}
            inactiveProps={{ className: 'text-secondary' }}
          >
            <Heart aria-hidden="true" size={22} fill="currentColor" />
          </Link>
          <button type="button" aria-label="Escanear" className="relative -top-4 grid size-16 place-items-center rounded-full border-[6px] border-canvas bg-primary text-canvas shadow-lg">
            <ScanLine aria-hidden="true" size={28} />
          </button>
          <Link to="/carrinho" aria-label={cartLabel} className="relative grid min-h-12 place-items-center text-secondary">
            <ShoppingCart aria-hidden="true" size={20} fill="currentColor" />
            {cartCount > 0 && (
              <span aria-hidden="true" className="absolute right-[calc(50%-18px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-canvas">
                {cartCount}
              </span>
            )}
          </Link>
          <Link
            to="/perfil"
            aria-label="Perfil"
            className="grid min-h-12 place-items-center"
            activeOptions={{ exact: true }}
            activeProps={{ className: 'text-primary' }}
            inactiveProps={{ className: 'text-secondary' }}
          >
            <UserRound aria-hidden="true" size={20} fill="currentColor" />
          </Link>
        </nav>
      )}
    </div>
  );
}

/** Avisos de alterações recebidas por Socket.IO (preço/disponibilidade de itens do carrinho). */
function RealtimeNotices() {
  const notices = useRealtimeNotices();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-end gap-2 md:left-auto md:right-6 md:top-[84px] md:w-[380px]"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          data-testid="realtime-notice"
          className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-primary/70 bg-raised px-4 py-3 font-mono text-sm shadow-lg"
        >
          <p className="flex-1">{notice.message}</p>
          <button
            type="button"
            aria-label="Fechar aviso"
            className="text-secondary hover:text-foreground"
            onClick={() => dismissRealtimeNotice(notice.id)}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <section>
      <h2 className="mb-3 font-bold">{title}</h2>
      <ul className="space-y-2 text-sm text-secondary">
        {links.map((label) => (
          <li key={label}>
            <a href="#catalogo" className="hover:text-primary">{label}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
