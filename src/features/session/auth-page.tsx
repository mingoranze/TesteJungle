import { useMutation } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { useId, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-input';
import { StatusMessage } from '@/components/ui/status-message';
import { HomePage } from '@/features/discovery/home-page';
import { defaultCatalogSearch } from '@/features/discovery/types';
import { login, register } from '@/features/session/api';
import { isPrivatePath, safeRedirect, type AuthSearch } from '@/features/session/redirect';
import { applyAuthenticatedSession, useAuthenticatedSession } from '@/features/session/session';
import { ApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';

export type AuthMode = 'login' | 'register';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/i;

const inputClass = cn(
  'w-full border border-border bg-transparent px-4 font-mono text-sm text-foreground outline-none transition-colors',
  'placeholder:text-secondary hover:border-primary/70 focus-visible:border-primary focus-visible:outline-none aria-invalid:border-error',
  'h-[50px] rounded-[10px] md:h-10 md:rounded-[3px] md:text-[13px]',
);

type FieldErrors = Partial<Record<'username' | 'email' | 'password' | 'confirmPassword', string>>;

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" width="12" height="20" viewBox="0 0 12 22">
      <path fill="#3B5998" d="M7.8 22V12h3.3l.5-3.9H7.8V5.6c0-1.1.3-1.9 1.9-1.9h2V.2C11.4.1 10.2 0 8.8 0 5.9 0 3.9 1.8 3.9 5.1v3H.6V12h3.3v10z" />
    </svg>
  );
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function AuthPage({ mode, search }: { mode: AuthMode; search: AuthSearch }) {
  const router = useRouter();
  const formId = useId();
  const currentSession = useAuthenticatedSession();
  const [values, setValues] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const isLogin = mode === 'login';
  const redirectTarget = safeRedirect(search.redirect, '/');
  const linkSearch = { ...(search.redirect ? { redirect: search.redirect } : {}) };

  const authMutation = useMutation({
    mutationFn: () => (isLogin
      ? login({ email: values.email.trim(), password: values.password })
      : register({
        name: values.username.trim(),
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
      })),
    onSuccess: async (response) => {
      await applyAuthenticatedSession(response);
      router.history.replace(redirectTarget);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setErrors({ email: error.message });
        return;
      }
      if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setErrors({ username: error.message });
        return;
      }
      setFormError(messageFor(error, 'Não foi possível concluir a operação. Tente novamente.'));
    },
  });

  const setValue = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!isLogin && !USERNAME_PATTERN.test(values.username.trim())) {
      next.username = 'Use de 3 a 30 letras, números, ponto, hífen ou sublinhado.';
    }
    if (!EMAIL_PATTERN.test(values.email.trim())) next.email = 'Informe um e-mail válido.';
    if (values.password.length < 8 || values.password.length > 128) {
      next.password = 'A senha deve ter entre 8 e 128 caracteres.';
    }
    if (!isLogin && values.confirmPassword !== values.password) {
      next.confirmPassword = 'As senhas não coincidem.';
    }
    return next;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    setNotice(undefined);
    const nextErrors = validate();
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(`${formId}-${firstInvalid}`)?.focus();
      return;
    }
    authMutation.mutate();
  };

  const close = () => {
    router.history.push(isPrivatePath(redirectTarget) ? '/' : redirectTarget);
  };

  const unavailable = (feature: string) => {
    setNotice(`${feature} não está disponível nesta demonstração. Use e-mail e senha.`);
  };

  const fieldProps = (field: keyof FieldErrors) => ({
    id: `${formId}-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${formId}-${field}-error` : undefined,
  });

  const fieldError = (field: keyof FieldErrors) => errors[field] && (
    <p id={`${formId}-${field}-error`} className="mt-1 text-left font-mono text-xs text-error">
      {errors[field]}
    </p>
  );

  return (
    <>
      <div className="hidden md:block" aria-hidden="true" inert>
        <HomePage search={defaultCatalogSearch} onSearchChange={() => undefined} />
      </div>

      <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent
          data-testid="auth-dialog"
          closeLabel="Fechar"
          closeClassName="hidden md:grid right-3 top-2.5"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(`${formId}-${isLogin ? 'email' : 'username'}`)?.focus();
          }}
          className={cn(
            'inset-0 overflow-y-auto bg-canvas px-7 pb-10 pt-[124px] font-mono',
            'md:inset-auto md:left-1/2 md:top-[158px] md:w-[500px] md:-translate-x-1/2 md:overflow-visible md:rounded-[4px]',
            'md:border-b-[10px] md:border-primary md:bg-surface md:px-0 md:pt-[46px]',
            isLogin ? 'md:pb-[93px]' : 'md:pb-[65px]',
          )}
        >
          <p className="text-center text-[34px] font-bold tracking-[0.12em] md:hidden" aria-hidden="true">KURIO</p>

          <nav aria-label="Acesso à conta" className="hidden items-center justify-center text-xl tracking-[0.06em] md:flex">
            <Link
              to="/login"
              search={linkSearch}
              replace
              aria-current={isLogin ? 'page' : undefined}
              className={cn('px-1', isLogin ? 'text-primary' : 'text-foreground hover:text-primary')}
            >
              Entrar
            </Link>
            <span aria-hidden="true" className="mx-1 h-6 w-0.5 bg-primary" />
            <Link
              to="/cadastro"
              search={linkSearch}
              replace
              aria-current={!isLogin ? 'page' : undefined}
              className={cn('px-1', !isLogin ? 'text-primary' : 'text-foreground hover:text-primary')}
            >
              Criar conta
            </Link>
          </nav>

          <DialogTitle className="mt-[78px] text-center text-xl font-bold md:sr-only">
            {isLogin ? 'Entrar' : 'Criar perfil de colecionador'}
          </DialogTitle>
          <DialogDescription className="mx-auto max-w-[410px] text-center text-[13px] leading-4 tracking-[0.02em] max-md:sr-only md:mt-[40px]">
            {isLogin
              ? 'Entre para gerenciar sua carteira, coleção e perfil de criador.'
              : 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.'}
          </DialogDescription>

          <form noValidate onSubmit={submit} className="mx-auto mt-[30px] w-full max-w-[358px] md:mt-6 md:max-w-[340px]">
            {search.reason === 'expired' && (
              <StatusMessage className="mb-3 text-xs">Sua sessão expirou. Entre novamente para continuar.</StatusMessage>
            )}
            {currentSession && (
              <StatusMessage className="mb-3 text-xs">
                Você já está conectado. Continuar com outra conta substitui a sessão atual.
              </StatusMessage>
            )}

            <div className="space-y-3">
              {!isLogin && (
                <div>
                  <label htmlFor={`${formId}-username`} className="sr-only">Nome de usuário</label>
                  <input
                    {...fieldProps('username')}
                    autoComplete="username"
                    placeholder="Nome de usuário"
                    value={values.username}
                    onChange={(event) => setValue('username', event.target.value)}
                    className={cn(inputClass, 'max-md:text-center max-md:placeholder:text-center')}
                  />
                  {fieldError('username')}
                </div>
              )}
              <div>
                <label htmlFor={`${formId}-email`} className="sr-only">E-mail</label>
                <input
                  {...fieldProps('email')}
                  type="email"
                  autoComplete="email"
                  placeholder={isLogin ? 'contato@email.com' : 'Digite seu e-mail'}
                  value={values.email}
                  onChange={(event) => setValue('email', event.target.value)}
                  className={inputClass}
                />
                {fieldError('email')}
              </div>
              <div>
                <label htmlFor={`${formId}-password`} className="sr-only">Senha</label>
                <PasswordInput
                  {...fieldProps('password')}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder={isLogin ? '••••••••••••' : 'Senha'}
                  value={values.password}
                  onChange={(event) => setValue('password', event.target.value)}
                  className={inputClass}
                  toggleClassName="text-[#6d4a33] md:text-secondary"
                />
                {fieldError('password')}
              </div>
              {!isLogin && (
                <div>
                  <label htmlFor={`${formId}-confirmPassword`} className="sr-only">Confirmar senha</label>
                  <PasswordInput
                    {...fieldProps('confirmPassword')}
                    autoComplete="new-password"
                    placeholder="Confirmar senha"
                    value={values.confirmPassword}
                    onChange={(event) => setValue('confirmPassword', event.target.value)}
                    className={inputClass}
                    toggleClassName="text-[#6d4a33] md:hidden"
                  />
                  {fieldError('confirmPassword')}
                </div>
              )}
            </div>

            {isLogin && (
              <div className="mt-2.5 text-right md:mt-2">
                <button
                  type="button"
                  onClick={() => unavailable('A recuperação de senha')}
                  className="text-[13px] tracking-[0.04em] text-primary hover:text-accent max-md:text-sm"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            {formError && (
              <StatusMessage role="alert" variant="error" className="mt-3 text-xs">{formError}</StatusMessage>
            )}
            {notice && <StatusMessage className="mt-3 text-xs">{notice}</StatusMessage>}

            <button
              type="submit"
              disabled={authMutation.isPending}
              className={cn(
                'w-full rounded-[10px] bg-primary font-bold tracking-[0.06em] text-canvas transition-colors hover:bg-accent disabled:opacity-60',
                'h-[60px] text-base md:h-11 md:rounded-[3px] md:text-[15px]',
                isLogin ? 'mt-8 md:mt-[17px]' : 'mt-10 md:mt-6',
              )}
            >
              {authMutation.isPending
                ? 'Aguarde…'
                : isLogin ? 'Entrar' : <><span className="md:hidden">Criar perfil</span><span className="hidden md:inline">Criar conta</span></>}
            </button>
          </form>

          <div className="mx-auto mt-[42px] w-full max-w-[358px] md:mt-[22px] md:max-w-none">
            <p className="flex items-center gap-3 text-[13px] tracking-[0.04em] before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
              Ou continue com
            </p>
            <div className={cn('mx-auto mt-3 max-w-[358px] space-y-4 md:max-w-[340px]', isLogin ? 'md:space-y-3' : 'md:space-y-4')}>
              <button
                type="button"
                onClick={() => unavailable('O acesso com Google')}
                className="flex h-10 w-full items-center justify-center gap-3 rounded-[3px] border border-border text-[13px] tracking-[0.04em] text-secondary hover:border-primary"
              >
                <GoogleIcon />
                Continuar com Google
              </button>
              <button
                type="button"
                onClick={() => unavailable('O acesso com Facebook')}
                className="flex h-10 w-full items-center justify-center gap-3 rounded-[3px] border border-border text-[13px] tracking-[0.04em] text-secondary hover:border-primary"
              >
                <FacebookIcon />
                Continuar com Facebook
              </button>
            </div>
          </div>

          <p className="mt-[37px] text-center text-[15px] tracking-[0.04em] text-secondary md:hidden">
            {isLogin ? (
              <Link to="/cadastro" search={linkSearch} replace className="hover:text-primary">
                Novo na Kurio? Crie uma conta
              </Link>
            ) : (
              <Link to="/login" search={linkSearch} replace className="hover:text-primary">
                Já tem uma conta? Entre
              </Link>
            )}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
