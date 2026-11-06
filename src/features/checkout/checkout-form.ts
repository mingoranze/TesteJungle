import type { CollectorDetails, Profile, Wallet, WalletNetwork, WalletType } from '@/domain/contracts';
import { walletNetworks, walletTypes } from '@/domain/contracts';

/** Campos do frame "Pagamento" (Perfil do colecionador) — mesmos limites validados pela API. */
export interface CheckoutFormValues {
  displayName: string;
  username: string;
  network: WalletNetwork | '';
  profileName: string;
  walletAddress: string;
  alternateAddress: string;
  provider: WalletType | '';
  referralCode: string;
  email: string;
  ensLabel: string;
  note: string;
}

export type CheckoutField = keyof CheckoutFormValues;
export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

/** Ordem visual dos campos, usada para levar o foco ao primeiro erro. */
export const checkoutFieldOrder: CheckoutField[] = [
  'displayName', 'username', 'network', 'profileName', 'walletAddress', 'alternateAddress',
  'provider', 'referralCode', 'email', 'ensLabel', 'note',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_.-]{3,30}$/i;
const ENS_LABEL = /^[a-z0-9-]{3,63}$/;
const REFERRAL = /^[a-z0-9-]{4,20}$/i;
const ADDRESS = /^0x[a-f\d]{40}$/i;

export function emptyCheckoutForm(): CheckoutFormValues {
  return {
    displayName: '', username: '', network: '', profileName: '', walletAddress: '', alternateAddress: '',
    provider: '', referralCode: '', email: '', ensLabel: '', note: '',
  };
}

/** Preenche o formulário a partir de uma carteira cadastrada e do perfil (usuário). */
export function prefillFromWallet(wallet: Wallet, profile: Profile | undefined, note = ''): CheckoutFormValues {
  const network = (walletNetworks as readonly string[]).includes(wallet.network) ? wallet.network as WalletNetwork : '';
  return {
    displayName: wallet.displayName,
    username: profile?.username ?? wallet.profileName,
    network,
    profileName: wallet.profileName,
    walletAddress: wallet.address,
    alternateAddress: wallet.alternateAddress ?? '',
    provider: (walletTypes as readonly string[]).includes(wallet.walletType) ? wallet.walletType : '',
    referralCode: wallet.referralCode,
    email: wallet.email,
    ensLabel: wallet.ensName.replace(/\.eth$/, ''),
    note,
  };
}

export function findWalletByAddress(wallets: readonly Wallet[], address: string) {
  const normalized = address.trim().toLowerCase();
  return wallets.find((wallet) => wallet.address.toLowerCase() === normalized);
}

export function validateCheckoutForm(values: CheckoutFormValues, wallets: readonly Wallet[]): CheckoutErrors {
  const errors: CheckoutErrors = {};
  const text = (value: string, min: number, max: number) => value.trim().length >= min && value.trim().length <= max;
  if (!text(values.displayName, 2, 60)) errors.displayName = 'Informe o nome de exibição (2 a 60 caracteres).';
  if (!USERNAME.test(values.username)) errors.username = 'Use 3 a 30 letras, números, ponto, hífen ou sublinhado.';
  if (!values.network) errors.network = 'Selecione uma rede.';
  if (!text(values.profileName, 2, 60)) errors.profileName = 'Informe o nome do perfil (2 a 60 caracteres).';
  const wallet = findWalletByAddress(wallets, values.walletAddress);
  if (!ADDRESS.test(values.walletAddress.trim())) errors.walletAddress = 'Informe um endereço 0x com 40 caracteres hexadecimais.';
  else if (!wallet) errors.walletAddress = 'Use o endereço de uma carteira cadastrada em Perfil › Carteiras.';
  else if (values.network && wallet.network !== values.network) {
    errors.network = `Esta carteira está cadastrada na rede ${wallet.network}.`;
  }
  const alternate = values.alternateAddress.trim();
  if (alternate && !ADDRESS.test(alternate) && !/^[a-z0-9-]{3,63}\.eth$/.test(alternate)) {
    errors.alternateAddress = 'Informe um nome ENS (.eth) ou um endereço 0x.';
  }
  if (!values.provider) errors.provider = 'Selecione o tipo de carteira.';
  if (!REFERRAL.test(values.referralCode)) errors.referralCode = 'Use 4 a 20 letras, números ou hífen.';
  if (!EMAIL.test(values.email.trim())) errors.email = 'Informe um e-mail válido.';
  if (!ENS_LABEL.test(values.ensLabel)) errors.ensLabel = 'Use 3 a 63 letras minúsculas, números ou hífen.';
  if (values.note.length > 500) errors.note = 'A observação deve ter no máximo 500 caracteres.';
  return errors;
}

export function collectorFrom(values: CheckoutFormValues): CollectorDetails {
  return {
    displayName: values.displayName.trim(),
    username: values.username.trim(),
    profileName: values.profileName.trim(),
    email: values.email.trim(),
    ensName: `${values.ensLabel}.eth`,
    referralCode: values.referralCode.trim(),
    alternateAddress: values.alternateAddress.trim() || null,
    note: values.note.trim() || null,
  };
}

export function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
