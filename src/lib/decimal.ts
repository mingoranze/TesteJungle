/**
 * Aritmética de valores ETH sobre strings decimais, sem ponto flutuante: os valores são
 * convertidos para unidades inteiras (BigInt) na maior escala envolvida.
 */
const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;

function scaleOf(value: string) {
  return value.split('.')[1]?.length ?? 0;
}

function toUnits(value: string, scale: number) {
  if (!DECIMAL_PATTERN.test(value)) throw new TypeError(`Valor decimal inválido: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function fromUnits(units: bigint, scale: number) {
  if (scale === 0) return units.toString();
  const digits = units.toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${digits.slice(0, -scale)}.${fraction}` : digits.slice(0, -scale);
}

/** Multiplica um preço decimal por uma quantidade inteira. */
export function multiplyDecimal(value: string, multiplier: number) {
  if (!Number.isSafeInteger(multiplier) || multiplier < 0) {
    throw new RangeError('O multiplicador deve ser um inteiro não negativo.');
  }
  const scale = scaleOf(value);
  return fromUnits(toUnits(value, scale) * BigInt(multiplier), scale);
}

export function compareDecimal(left: string, right: string) {
  const scale = Math.max(scaleOf(left), scaleOf(right));
  const difference = toUnits(left, scale) - toUnits(right, scale);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}

/** Formata para exibição preservando todas as casas recebidas, com no mínimo `minDecimals`. */
export function formatEth(value: string, minDecimals = 2) {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(minDecimals, '0')}`;
}
