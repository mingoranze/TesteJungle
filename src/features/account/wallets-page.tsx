import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FormField, fieldInputClass } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import {
  walletNetworks,
  walletTypes,
  type Profile,
  type Wallet,
  type WalletInput,
  type WalletRole,
} from '@/domain/contracts';
import {
  accountKeys,
  createWallet,
  deleteWallet,
  getProfile,
  listWallets,
  updateWallet,
} from '@/features/account/api';
import {
  apiFieldErrors,
  EMAIL_PATTERN,
  ENS_LABEL_PATTERN,
  ENS_NAME_PATTERN,
  ensLabel,
  REFERRAL_PATTERN,
  WALLET_ADDRESS_PATTERN,
} from '@/features/account/validation';
import { useAuthenticatedSession } from '@/features/session/session';
import { ApiError } from '@/lib/api-error';

interface WalletFormValues {
  displayName: string;
  nickname: string;
  network: string;
  profileName: string;
  address: string;
  alternateAddress: string;
  walletType: string;
  referralCode: string;
  email: string;
  ensLabel: string;
}

type WalletErrors = Partial<Record<keyof WalletFormValues, string>>;

const emptyValues: WalletFormValues = {
  displayName: '',
  nickname: '',
  network: '',
  profileName: '',
  address: '',
  alternateAddress: '',
  walletType: '',
  referralCode: '',
  email: '',
  ensLabel: '',
};

/** Campos de identificação que podem ser repetidos da carteira principal na secundária. */
const SHARED_FIELDS = ['displayName', 'network', 'profileName', 'walletType', 'referralCode', 'email', 'ensLabel'] as const;

function valuesFromWallet(wallet: Wallet): WalletFormValues {
  return {
    displayName: wallet.displayName,
    nickname: wallet.nickname,
    network: wallet.network,
    profileName: wallet.profileName,
    address: wallet.address,
    alternateAddress: wallet.alternateAddress ?? '',
    walletType: wallet.walletType,
    referralCode: wallet.referralCode,
    email: wallet.email,
    ensLabel: ensLabel(wallet.ensName),
  };
}

function valuesFromProfile(profile: Profile | undefined): WalletFormValues {
  if (!profile) return emptyValues;
  return {
    ...emptyValues,
    displayName: profile.name,
    nickname: profile.walletNickname ?? '',
    profileName: profile.username,
    email: profile.email,
    ensLabel: ensLabel(profile.ensName),
  };
}

function toInput(values: WalletFormValues): Omit<WalletInput, 'role'> {
  return {
    displayName: values.displayName.trim(),
    nickname: values.nickname.trim(),
    network: values.network,
    profileName: values.profileName.trim(),
    address: values.address.trim(),
    alternateAddress: values.alternateAddress.trim() || null,
    walletType: values.walletType as WalletInput['walletType'],
    referralCode: values.referralCode.trim(),
    email: values.email.trim(),
    ensName: `${values.ensLabel.trim().toLowerCase()}.eth`,
  };
}

function validate(values: WalletFormValues): WalletErrors {
  const errors: WalletErrors = {};
  if (!values.displayName.trim()) errors.displayName = 'Informe o nome de exibição.';
  if (!values.nickname.trim() || values.nickname.trim().length > 40) errors.nickname = 'Informe um apelido com até 40 caracteres.';
  if (!values.network) errors.network = 'Selecione uma rede.';
  if (!values.profileName.trim()) errors.profileName = 'Informe o nome do perfil.';
  if (!WALLET_ADDRESS_PATTERN.test(values.address.trim())) errors.address = 'Informe um endereço 0x com 40 caracteres hexadecimais.';
  const alternate = values.alternateAddress.trim();
  if (alternate && !WALLET_ADDRESS_PATTERN.test(alternate) && !ENS_NAME_PATTERN.test(alternate.toLowerCase())) {
    errors.alternateAddress = 'Use um endereço 0x ou um nome ENS terminado em .eth.';
  }
  if (!values.walletType) errors.walletType = 'Selecione uma carteira.';
  if (!REFERRAL_PATTERN.test(values.referralCode.trim())) errors.referralCode = 'Use de 4 a 20 letras, números ou hífen.';
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Informe um e-mail válido.';
  if (!ENS_LABEL_PATTERN.test(values.ensLabel.trim().toLowerCase())) errors.ensLabel = 'Use de 3 a 63 letras minúsculas, números ou hífen.';
  return errors;
}

function SelectField({
  value,
  onChange,
  placeholder,
  options,
  ...props
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: readonly string[];
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
  'aria-required': boolean | undefined;
}) {
  return (
    <div className="relative">
      <select
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldInputClass} appearance-none pr-10 ${value ? '' : 'text-secondary'}`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown aria-hidden="true" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary" />
    </div>
  );
}

interface WalletFormProps {
  idPrefix: string;
  values: WalletFormValues;
  errors: WalletErrors;
  pending: boolean;
  result?: { message: string; error: boolean };
  onChange: (field: keyof WalletFormValues, value: string) => void;
  onSubmit: () => void;
  label: string;
}

function WalletForm({ idPrefix, values, errors, pending, result, onChange, onSubmit, label }: WalletFormProps) {
  const text = (field: keyof WalletFormValues, fieldLabel: string, options: { type?: string; placeholder?: string } = {}) => (
    <FormField id={`${idPrefix}-${field}`} label={fieldLabel} required error={errors[field]} labelClassName="mb-0">
      {(props) => (
        <input
          {...props}
          type={options.type ?? 'text'}
          placeholder={options.placeholder}
          value={values[field]}
          onChange={(event) => onChange(field, event.target.value)}
          className={fieldInputClass}
        />
      )}
    </FormField>
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form noValidate onSubmit={submit} aria-label={label} className="mt-8 font-mono">
      <div className="grid gap-x-7 gap-y-[26px] md:grid-cols-2">
        {text('displayName', 'Nome de exibição')}
        {text('nickname', 'Apelido da carteira')}
        <FormField id={`${idPrefix}-network`} label="Rede " required error={errors.network} labelClassName="mb-0">
          {(props) => (
            <SelectField {...props} value={values.network} onChange={(value) => onChange('network', value)} placeholder="Selecione uma rede" options={walletNetworks} />
          )}
        </FormField>
        {text('profileName', 'Nome do perfil')}
        {text('address', 'Endereço da carteira', { placeholder: 'Endereço 0x da carteira' })}
        <FormField
          id={`${idPrefix}-alternateAddress`}
          label="ENS ou carteira secundária (opcional)"
          hideLabel
          error={errors.alternateAddress}
          className="md:pt-[22px]"
        >
          {(props) => (
            <input
              {...props}
              placeholder="ENS ou carteira secundária (opcional)"
              value={values.alternateAddress}
              onChange={(event) => onChange('alternateAddress', event.target.value)}
              className={fieldInputClass}
            />
          )}
        </FormField>
        <FormField id={`${idPrefix}-walletType`} label="Tipo de carteira" required error={errors.walletType} labelClassName="mb-0">
          {(props) => (
            <SelectField {...props} value={values.walletType} onChange={(value) => onChange('walletType', value)} placeholder="Selecione uma carteira" options={walletTypes} />
          )}
        </FormField>
        {text('referralCode', 'Código de indicação')}
        {text('email', 'E-mail', { type: 'email' })}
        <FormField id={`${idPrefix}-ensLabel`} label="Nome ENS " required error={errors.ensLabel} labelClassName="mb-0">
          {(props) => (
            <div className="flex gap-2.5">
              <div className="relative w-[78px] shrink-0">
                <select aria-label="Domínio ENS" className={`${fieldInputClass} appearance-none pr-7`} defaultValue=".eth">
                  <option value=".eth">.eth</option>
                </select>
                <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
              </div>
              <input {...props} value={values.ensLabel} onChange={(event) => onChange('ensLabel', event.target.value)} className={fieldInputClass} />
            </div>
          )}
        </FormField>
      </div>
      {result && (
        <StatusMessage role={result.error ? 'alert' : 'status'} variant={result.error ? 'error' : 'neutral'} className="mt-6">
          {result.message}
        </StatusMessage>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="mt-8 h-10 min-h-10 w-[131px] rounded-[2px] px-0 font-mono text-sm font-bold"
      >
        {pending ? 'Salvando…' : 'Salvar carteira'}
      </Button>
    </form>
  );
}

function useWalletEditor({
  userId,
  role,
  wallet,
  initial,
  idPrefix,
}: {
  userId: string;
  role: WalletRole;
  wallet: Wallet | undefined;
  initial: WalletFormValues;
  idPrefix: string;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<WalletErrors>({});
  const [result, setResult] = useState<{ message: string; error: boolean }>();

  const mutation = useMutation({
    mutationFn: (input: Omit<WalletInput, 'role'>) => (wallet
      ? updateWallet(wallet.id, input)
      : createWallet({ ...input, role })),
    onSuccess: async () => {
      setResult({ message: 'Carteira salva.', error: false });
      await queryClient.invalidateQueries({ queryKey: accountKeys.wallets(userId) });
    },
    onError: (error) => {
      setErrors(apiFieldErrors(error, { ensName: 'ensLabel' }) as WalletErrors);
      setResult({
        message: error instanceof ApiError ? error.message : 'Não foi possível salvar a carteira. Tente novamente.',
        error: true,
      });
    },
  });

  return {
    values,
    errors,
    result,
    pending: mutation.isPending,
    setValues,
    onChange: (field: keyof WalletFormValues, value: string) => {
      setValues((current) => ({ ...current, [field]: value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
    },
    onSubmit: () => {
      setResult(undefined);
      const nextErrors = validate(values);
      setErrors(nextErrors);
      const firstInvalid = Object.keys(nextErrors)[0];
      if (firstInvalid) {
        document.getElementById(`${idPrefix}-${firstInvalid}`)?.focus();
        return;
      }
      mutation.mutate(toInput(values));
    },
  };
}

function SectionHeader({ id, title, description, actions }: { id: string; title: string; description: string; actions: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 font-mono">
      <div>
        <h2 id={id} className="text-lg font-bold leading-4">{title}</h2>
        <p className="mt-1 text-[13px] tracking-[0.02em] text-secondary">{description}</p>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

const linkButtonClass = 'font-mono text-base font-bold text-primary hover:text-accent disabled:opacity-50';

function WalletsEditor({ userId, wallets, profile }: { userId: string; wallets: Wallet[]; profile: Profile | undefined }) {
  const queryClient = useQueryClient();
  const principal = wallets.find((wallet) => wallet.role === 'principal');
  const secondary = wallets.find((wallet) => wallet.role === 'secundaria');
  const principalEditor = useWalletEditor({
    userId,
    role: 'principal',
    wallet: principal,
    initial: principal ? valuesFromWallet(principal) : valuesFromProfile(profile),
    idPrefix: 'wallet-principal',
  });
  const secondaryEditor = useWalletEditor({
    userId,
    role: 'secundaria',
    wallet: secondary,
    initial: secondary ? valuesFromWallet(secondary) : emptyValues,
    idPrefix: 'wallet-secondary',
  });
  const [addingSecondary, setAddingSecondary] = useState(false);
  const [sameAsPrincipal, setSameAsPrincipal] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState<string>();
  const [removalResult, setRemovalResult] = useState<string>();

  const removeMutation = useMutation({
    mutationFn: deleteWallet,
    onSuccess: async () => {
      setConfirmRemoval(undefined);
      setRemovalResult(undefined);
      await queryClient.invalidateQueries({ queryKey: accountKeys.wallets(userId) });
    },
    onError: (error) => {
      setRemovalResult(error instanceof ApiError ? error.message : 'Não foi possível remover a carteira.');
    },
  });

  const copyPrincipal = (checked: boolean) => {
    setSameAsPrincipal(checked);
    if (!checked) return;
    setAddingSecondary(true);
    const source = principal ? valuesFromWallet(principal) : principalEditor.values;
    secondaryEditor.setValues((current) => ({
      ...current,
      ...Object.fromEntries(SHARED_FIELDS.map((field) => [field, source[field]])),
    }));
  };

  const removeButton = (wallet: Wallet) => (confirmRemoval === wallet.id ? (
    <>
      <button type="button" className={linkButtonClass} disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(wallet.id)}>
        Confirmar remoção
      </button>
      <button type="button" className="font-mono text-sm hover:text-primary" onClick={() => setConfirmRemoval(undefined)}>Cancelar</button>
    </>
  ) : (
    <button type="button" className={linkButtonClass} onClick={() => setConfirmRemoval(wallet.id)}>
      Remover
    </button>
  ));

  const showSecondaryForm = Boolean(secondary) || addingSecondary;

  return (
    <div>
      {removalResult && <StatusMessage role="alert" variant="error" className="mb-4">{removalResult}</StatusMessage>}
      <section aria-labelledby="wallet-principal-title">
        <SectionHeader
          id="wallet-principal-title"
          title="Carteira principal"
          description="Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados."
          actions={principal ? removeButton(principal) : (
            <button type="button" className={linkButtonClass} onClick={() => document.getElementById('wallet-principal-displayName')?.focus()}>
              Adicionar
            </button>
          )}
        />
        <WalletForm idPrefix="wallet-principal" label="Carteira principal" {...principalEditor} />
      </section>

      <section aria-labelledby="wallet-secondary-title" className="mt-10">
        <div className="flex flex-wrap items-start justify-between gap-3 font-mono">
          <h2 id="wallet-secondary-title" className="text-lg font-bold leading-6">Carteira secundária</h2>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sameAsPrincipal}
                disabled={!principal}
                onChange={(event) => copyPrincipal(event.target.checked)}
                className="size-4 appearance-none rounded-full border border-primary checked:border-[5px] disabled:opacity-50"
              />
              Igual à carteira principal
            </label>
            {secondary ? removeButton(secondary) : !addingSecondary && (
              <button
                type="button"
                className={linkButtonClass}
                disabled={!principal}
                onClick={() => setAddingSecondary(true)}
              >
                Adicionar
              </button>
            )}
          </div>
        </div>
        {!showSecondaryForm && (
          <p className="mt-3 font-mono text-[13px] tracking-[0.02em] text-secondary">
            {principal
              ? 'Você ainda não adicionou uma carteira secundária.'
              : 'Cadastre a carteira principal antes de adicionar uma secundária.'}
          </p>
        )}
        {showSecondaryForm && (
          <WalletForm idPrefix="wallet-secondary" label="Carteira secundária" {...secondaryEditor} />
        )}
      </section>
    </div>
  );
}

function WalletsSkeleton() {
  return (
    <div data-testid="wallets-skeleton" className="space-y-6">
      <Skeleton className="h-6 w-56" />
      <div className="grid gap-x-7 gap-y-[29px] md:grid-cols-2">
        {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="h-[64px] w-full" />)}
      </div>
    </div>
  );
}

export function WalletsPage() {
  const session = useAuthenticatedSession();
  const userId = session?.userId;
  const walletsQuery = useQuery({
    queryKey: accountKeys.wallets(userId ?? 'anonymous'),
    queryFn: ({ signal }) => listWallets(signal),
    enabled: Boolean(userId),
  });
  const profileQuery = useQuery({
    queryKey: accountKeys.profile(userId ?? 'anonymous'),
    queryFn: ({ signal }) => getProfile(signal),
    enabled: Boolean(userId),
  });

  if (!userId || walletsQuery.isPending || profileQuery.isPending) return <WalletsSkeleton />;
  if (walletsQuery.isError) {
    return (
      <StatusMessage role="alert" variant="error">
        {walletsQuery.error instanceof ApiError ? walletsQuery.error.message : 'Não foi possível carregar as carteiras.'}{' '}
        <Button type="button" variant="secondary" size="sm" onClick={() => void walletsQuery.refetch()}>Tentar novamente</Button>
      </StatusMessage>
    );
  }

  const editorKey = walletsQuery.data.map((wallet) => `${wallet.id}:${wallet.role}`).sort().join('|') || 'empty';
  return <WalletsEditor key={editorKey} userId={userId} wallets={walletsQuery.data} profile={profileQuery.data} />;
}
