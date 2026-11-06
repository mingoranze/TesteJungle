import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Heart, LogIn, Search, ShoppingCart, UserRound, X } from 'lucide-react';
import homeIcon from '@/assets/images/mobile/Home.png';
import scanIcon from '@/assets/images/mobile/Group.png';
import cartIcon from '@/assets/images/mobile/Shop.svg';
import userIcon from '@/assets/images/mobile/User.svg';
import { cartUnitCount, useCart } from '@/features/cart/use-cart';
import { dismissRealtimeNotice, useRealtimeNotices } from '@/features/realtime/realtime-notices';
import { useMarketplaceRealtime } from '@/features/realtime/use-marketplace-realtime';
import { useAuthenticatedSession } from '@/features/session/session';

import facebookIcon from '@/assets/images/social/Frame 108.png';
import instagramIcon from '@/assets/images/social/Frame 109.png';
import twitterIcon from '@/assets/images/social/Frame 110.png';
import linkedinIcon from '@/assets/images/social/Frame 111.png';
import youtubeIcon from '@/assets/images/social/Frame 112.png';

const socialLinks = [
  { name: 'Facebook', icon: facebookIcon },
  { name: 'Instagram', icon: instagramIcon },
  { name: 'Twitter', icon: twitterIcon },
  { name: 'LinkedIn', icon: linkedinIcon },
  { name: 'YouTube', icon: youtubeIcon },
];

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
        className={`mt-auto pb-24 lg:pb-0 ${isNftDetail ? 'hidden lg:block' : ''} ${isAuthRoute || isCart ? 'hidden md:block' : ''}`}
      >
        <div className="mx-auto hidden w-full max-w-[1200px] bg-surface md:block">
        <section className="grid grid-cols-2 gap-5 px-6 py-6 lg:grid-cols-4 lg:px-10">
          <article className="flex flex-col items-start gap-3 border-r border-primary/70 pr-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-mono text-xl font-bold text-canvas">W</span>
            <div>
              <h2 className="font-bold">Segurança da carteira</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">Proteja sua carteira e colecione arte digital verificada com confiança.</p>
            </div>
          </article>
          <article className="flex flex-col items-start gap-3 border-r border-primary/70 pr-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-mono text-xl font-bold text-canvas">C</span>
            <div>
              <h2 className="font-bold">Criadores em destaque</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.</p>
            </div>
          </article>
          <article className="flex flex-col items-start gap-3 border-r border-primary/70 pr-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-mono text-xl font-bold text-canvas">D</span>
            <div>
              <h2 className="font-bold">Alertas de lançamentos</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.</p>
            </div>
          </article>
          <form className="flex flex-col justify-center">
            <label htmlFor="footer-newsletter" className="font-bold">Antecipe-se ao próximo lançamento</label>
            <div className="mt-3 flex">
              <input id="footer-newsletter" type="email" placeholder="digite seu e-mail..." className="min-w-0 flex-1 rounded-l bg-[#3b2411] px-3 py-2 text-xs transition-colors placeholder:text-secondary outline-none hover:bg-[#4a2e16] focus:bg-[#4a2e16] focus:outline-none focus-visible:outline-none" />
              <button type="button" className="rounded-r bg-primary px-3 text-sm font-bold text-canvas transition-colors outline-none hover:bg-accent focus:outline-none focus-visible:bg-accent focus-visible:outline-none active:bg-accent">Enviar</button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-secondary">Receba lançamentos selecionados, histórias de criadores e novidades do mercado.</p>
          </form>
        </section>

        <div className="hidden bg-[#3b2411] lg:block">
          <div className="grid grid-cols-2 items-center gap-4 px-6 py-5 font-mono text-sm lg:grid-cols-4">
            <span className="font-bold tracking-[0.16em]">KURIO</span>
            <span className="text-center">Feito para colecionadores,<br />criadores e cultura.</span>
            <a className="text-center" href="mailto:contato@email.com">contato@email.com</a>
            <a className="text-center" href="tel:+551140028922">+55 11 4002 8922</a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 px-6 py-6 lg:grid-cols-4">
          <FooterColumn title="Meu perfil" links={['Meu perfil', 'Minha coleção', 'Atividade', 'Estúdio do criador', 'Lista de interesse']} />
          <FooterColumn title="Central de ajuda" links={['Central de ajuda', 'Como comprar NFTs', 'Carteira e segurança', 'Política do mercado', 'Denunciar item']} />
          <FooterColumn title="Coleções" links={['Arte digital', 'Fotografia', 'Música', 'Arte 3D', 'Utilidade']} />
          <section>
            <h2 className="font-bold">Redes sociais</h2>
            <div className="mt-3 flex gap-2">
              {socialLinks.map((social) => (
                <a key={social.name} href="#destaques" aria-label={social.name} className="block size-8 transition-opacity hover:opacity-80">
                  <img src={social.icon} alt="" className="size-full" />
                </a>
              ))}
            </div>
            <h3 className="mt-5 font-bold">Carteiras compatíveis</h3>
            <p className="mt-2 inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-primary/25 bg-[#3b2411] px-2.5 py-2 font-mono text-[10px] font-bold tracking-wide text-primary">
              <span>METAMASK</span>
              <span aria-hidden="true">•</span>
              <span>WALLETCONNECT</span>
              <span aria-hidden="true">•</span>
              <span>COINBASE</span>
            </p>
          </section>
        </div>
        </div>
        <p className="border-t border-border py-3 text-center font-mono text-xs lg:border-0">
          © 2026 Kurio. Propriedade digital para todos.
        </p>
        <p className="px-4 pb-4 text-center text-xs text-secondary lg:hidden">
          <Link to="/foundation" search={{ scenario: 'baseline' }}>Ambiente de demonstração</Link>
        </p>
      </footer>

      {!hideMobileChrome && (
        <nav
          aria-label="Navegação móvel"
          className="fixed inset-x-0 bottom-0 z-40 h-[calc(86px+env(safe-area-inset-bottom))] md:hidden"
        >
          {/* Fundo da barra: duas abas arredondadas unidas por um recorte côncavo onde encaixa o botão central. */}
          <div aria-hidden="true" className="absolute inset-0 flex">
            <div className="flex-1 rounded-l-[2rem] bg-surface" />
            <div className="flex w-[120px] shrink-0 flex-col">
              <svg width="120" height="48" viewBox="0 0 120 48" className="block shrink-0">
                <path
                  className="fill-surface"
                  d="M0 0H4C10 0 14 4 17.7 12A44 44 0 0 0 102.3 12C106 4 110 0 116 0H120V48H0Z"
                />
              </svg>
              <div className="-mt-px flex-1 bg-surface" />
            </div>
            <div className="flex-1 rounded-r-[2rem] bg-surface" />
          </div>
          <div className="relative grid h-[86px] grid-cols-[1fr_1fr_120px_1fr_1fr] items-center px-5">
          <Link to="/" activeOptions={{ exact: true }} aria-label="Início" className="grid min-h-12 place-items-center text-primary">
            <img src={homeIcon} alt="" aria-hidden="true" className="size-5" />
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
          <button
            type="button"
            aria-label="Escanear"
            className="-mt-[30px] grid size-[60px] place-items-center self-start justify-self-center rounded-full bg-linear-to-b from-[#7a4f2c] to-[#d48d4f] text-white"
          >
            <img src={scanIcon} alt="" aria-hidden="true" className="h-6 w-[27px]" />
          </button>
          <Link to="/carrinho" aria-label={cartLabel} className="relative grid min-h-12 place-items-center text-secondary">
            <img src={cartIcon} alt="" aria-hidden="true" className="size-5" />
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
            <img src={userIcon} alt="" aria-hidden="true" className="size-5" />
          </Link>
          </div>
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
      <ul className="space-y-2 text-sm">
        {links.map((label) => (
          <li key={label}>
            <a href="#catalogo" className="hover:text-primary">{label}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
