import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Image as ImageIcon } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormField, fieldInputClass } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import type { Profile } from '@/domain/contracts';
import { accountKeys, changePassword, getProfile, updateProfile } from '@/features/account/api';
import { apiFieldErrors, ENS_LABEL_PATTERN, EMAIL_PATTERN, ensLabel, USERNAME_PATTERN } from '@/features/account/validation';
import { useAuthenticatedSession } from '@/features/session/session';
import { ApiError } from '@/lib/api-error';

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AVATAR_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 192;

interface ProfileFormValues {
  name: string;
  username: string;
  email: string;
  ensLabel: string;
  walletNickname: string;
  avatarUrl: string | null;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>;

/** Redimensiona e recorta a imagem no navegador para manter o avatar leve no armazenamento simulado. */
async function avatarDataUrl(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Imagem inválida.'));
      element.src = objectUrl;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context || side < 1) throw new Error('Imagem inválida.');
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    const webp = canvas.toDataURL('image/webp', 0.85);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function initialValues(profile: Profile): ProfileFormValues {
  return {
    name: profile.name,
    username: profile.username,
    email: profile.email,
    ensLabel: ensLabel(profile.ensName),
    walletNickname: profile.walletNickname ?? '',
    avatarUrl: profile.avatarUrl,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
}

function validate(values: ProfileFormValues): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!values.name.trim() || values.name.trim().length > 80) errors.name = 'Informe um nome de exibição com até 80 caracteres.';
  if (!USERNAME_PATTERN.test(values.username.trim())) errors.username = 'Use de 3 a 30 letras, números, ponto, hífen ou sublinhado.';
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Informe um e-mail válido.';
  if (!ENS_LABEL_PATTERN.test(values.ensLabel.trim().toLowerCase())) {
    errors.ensLabel = 'Use de 3 a 63 letras minúsculas, números ou hífen.';
  }
  if (!values.walletNickname.trim() || values.walletNickname.trim().length > 40) {
    errors.walletNickname = 'Informe um apelido com até 40 caracteres.';
  }
  const changingPassword = Boolean(values.currentPassword || values.newPassword || values.confirmPassword);
  if (changingPassword) {
    if (!values.currentPassword) errors.currentPassword = 'Informe a senha atual.';
    if (values.newPassword.length < 8 || values.newPassword.length > 128) {
      errors.newPassword = 'A nova senha deve ter entre 8 e 128 caracteres.';
    } else if (values.newPassword === values.currentPassword) {
      errors.newPassword = 'A nova senha deve ser diferente da atual.';
    }
    if (values.confirmPassword !== values.newPassword) errors.confirmPassword = 'As senhas não coincidem.';
  }
  return errors;
}

function ProfileSkeleton() {
  return (
    <div data-testid="profile-skeleton" className="grid gap-x-7 gap-y-[31px] md:grid-cols-2">
      <Skeleton className="h-5 w-48 md:col-span-2" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

function ProfileForm({ profile, userId }: { profile: Profile; userId: string }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(() => initialValues(profile));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [result, setResult] = useState<{ message: string; error: boolean }>();
  const avatarChanged = values.avatarUrl !== profile.avatarUrl;

  const setValue = <K extends keyof ProfileFormValues>(field: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const saveMutation = useMutation({
    mutationFn: async (input: ProfileFormValues) => {
      const updated = await updateProfile({
        name: input.name.trim(),
        username: input.username.trim(),
        email: input.email.trim(),
        ensName: `${input.ensLabel.trim().toLowerCase()}.eth`,
        walletNickname: input.walletNickname.trim(),
        avatarUrl: input.avatarUrl,
      });
      queryClient.setQueryData(accountKeys.profile(userId), updated);
      const passwordChanged = Boolean(input.newPassword);
      if (passwordChanged) {
        await changePassword({ currentPassword: input.currentPassword, newPassword: input.newPassword });
      }
      return { updated, passwordChanged };
    },
    onSuccess: ({ updated, passwordChanged }) => {
      setValues({ ...initialValues(updated) });
      setResult({ message: passwordChanged ? 'Perfil e senha atualizados.' : 'Perfil atualizado.', error: false });
    },
    onError: (error) => {
      const fields = apiFieldErrors(error, { ensName: 'ensLabel' }) as ProfileErrors;
      setErrors(fields);
      setResult({
        message: error instanceof ApiError ? error.message : 'Não foi possível salvar o perfil. Tente novamente.',
        error: true,
      });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(undefined);
    const nextErrors = validate(values);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(`profile-${firstInvalid}`)?.focus();
      return;
    }
    saveMutation.mutate(values);
  };

  const selectAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type) || file.size > AVATAR_SOURCE_MAX_BYTES) {
      setErrors((current) => ({ ...current, avatarUrl: 'Selecione uma imagem PNG, JPEG ou WebP de até 5 MB.' }));
      return;
    }
    try {
      setValue('avatarUrl', await avatarDataUrl(file));
    } catch {
      setErrors((current) => ({ ...current, avatarUrl: 'Não foi possível ler esta imagem.' }));
    }
  };

  return (
    <form noValidate onSubmit={submit} aria-labelledby="profile-title" className="font-mono">
      <h2 id="profile-title" className="text-base font-bold leading-4 tracking-[0.02em]">Perfil do colecionador</h2>

      <div className="mt-[38px] grid gap-x-7 gap-y-7 md:grid-cols-2">
        <FormField id="profile-name" label="Nome de exibição" required error={errors.name}>
          {(props) => (
            <input {...props} autoComplete="name" value={values.name} onChange={(event) => setValue('name', event.target.value)} className={fieldInputClass} />
          )}
        </FormField>
        <FormField id="profile-username" label="Nome de usuário" required error={errors.username}>
          {(props) => (
            <input {...props} autoComplete="username" value={values.username} onChange={(event) => setValue('username', event.target.value)} className={fieldInputClass} />
          )}
        </FormField>
        <FormField id="profile-email" label="E-mail" required error={errors.email}>
          {(props) => (
            <input {...props} type="email" autoComplete="email" value={values.email} onChange={(event) => setValue('email', event.target.value)} className={fieldInputClass} />
          )}
        </FormField>
        <FormField id="profile-ensLabel" label={<>Nome ENS </>} required error={errors.ensLabel}>
          {(props) => (
            <div className="flex gap-2.5">
              <div className="relative w-[78px] shrink-0">
                <select aria-label="Domínio ENS" className={`${fieldInputClass} appearance-none pr-7`} defaultValue=".eth">
                  <option value=".eth">.eth</option>
                </select>
                <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
              </div>
              <input {...props} value={values.ensLabel} onChange={(event) => setValue('ensLabel', event.target.value)} className={fieldInputClass} />
            </div>
          )}
        </FormField>
        <FormField id="profile-walletNickname" label="Apelido da carteira" required error={errors.walletNickname}>
          {(props) => (
            <input {...props} value={values.walletNickname} onChange={(event) => setValue('walletNickname', event.target.value)} className={fieldInputClass} />
          )}
        </FormField>
        <div className="min-w-0">
          <p id="profile-avatar-label" className="mb-2 text-[15px]">Avatar</p>
          <div className="flex items-center gap-6">
            <span className="grid size-[50px] shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface text-primary">
              {values.avatarUrl
                ? <img src={values.avatarUrl} alt="Avatar atual" className="size-full object-cover" />
                : <ImageIcon aria-label="Sem avatar" size={22} strokeWidth={1.5} />}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept={AVATAR_TYPES.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivo do avatar"
              onChange={(event) => void selectAvatar(event)}
            />
            <Button
              type="button"
              size="sm"
              aria-describedby="profile-avatar-label"
              onClick={() => fileInput.current?.click()}
              className="h-10 min-h-10 w-[98px] rounded-[2px] font-mono text-sm font-bold"
            >
              Alterar
            </Button>
            <button
              type="button"
              disabled={!values.avatarUrl}
              aria-describedby="profile-avatar-label"
              onClick={() => setValue('avatarUrl', null)}
              className="text-sm hover:text-primary disabled:cursor-not-allowed"
            >
              Remover
            </button>
          </div>
          {errors.avatarUrl && <p role="alert" className="mt-1.5 text-xs text-error">{errors.avatarUrl}</p>}
          {avatarChanged && !errors.avatarUrl && (
            <p className="mt-1.5 text-xs text-secondary">Clique em Salvar para aplicar o novo avatar.</p>
          )}
        </div>
      </div>

      <fieldset className="mt-7 grid gap-y-[22px] md:w-[calc(50%-14px)]">
        <legend className="mb-[18px] text-base font-bold">Alterar senha</legend>
        <FormField id="profile-currentPassword" label="Senha atual" error={errors.currentPassword} labelClassName="mb-2.5">
          {(props) => (
            <PasswordInput {...props} autoComplete="current-password" value={values.currentPassword} onChange={(event) => setValue('currentPassword', event.target.value)} className={fieldInputClass} />
          )}
        </FormField>
        <FormField id="profile-newPassword" label="Nova senha" error={errors.newPassword} labelClassName="mb-2.5">
          {(props) => (
            <PasswordInput {...props} autoComplete="new-password" value={values.newPassword} onChange={(event) => setValue('newPassword', event.target.value)} className={fieldInputClass} />
          )}
        </FormField>
        <FormField id="profile-confirmPassword" label="Confirmar nova senha" error={errors.confirmPassword} labelClassName="mb-2.5">
          {(props) => (
            <PasswordInput {...props} autoComplete="new-password" value={values.confirmPassword} onChange={(event) => setValue('confirmPassword', event.target.value)} className={fieldInputClass} />
          )}
        </FormField>
      </fieldset>

      {result && (
        <StatusMessage role={result.error ? 'alert' : 'status'} variant={result.error ? 'error' : 'neutral'} className="mt-6 md:w-[calc(50%-14px)]">
          {result.message}
        </StatusMessage>
      )}

      <Button
        type="submit"
        disabled={saveMutation.isPending}
        className="mt-8 h-10 min-h-10 w-[131px] rounded-[2px] font-mono text-sm font-bold"
      >
        {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  );
}

export function ProfilePage() {
  const session = useAuthenticatedSession();
  const userId = session?.userId;
  const profileQuery = useQuery({
    queryKey: accountKeys.profile(userId ?? 'anonymous'),
    queryFn: ({ signal }) => getProfile(signal),
    enabled: Boolean(userId),
  });

  if (!userId || profileQuery.isPending) return <ProfileSkeleton />;
  if (profileQuery.isError) {
    return (
      <StatusMessage role="alert" variant="error">
        {profileQuery.error instanceof ApiError ? profileQuery.error.message : 'Não foi possível carregar o perfil.'}{' '}
        <Button type="button" variant="secondary" size="sm" onClick={() => void profileQuery.refetch()}>Tentar novamente</Button>
      </StatusMessage>
    );
  }
  return <ProfileForm key={profileQuery.data.userId} profile={profileQuery.data} userId={userId} />;
}
