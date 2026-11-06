import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">404</p>
      <h1 className="text-3xl font-semibold text-foreground">Página não encontrada</h1>
      <p className="text-secondary">Confira o endereço ou volte para a página inicial.</p>
      <div>
        <Button asChild variant="secondary">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </section>
  );
}
