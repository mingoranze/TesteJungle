import { expect, test } from '@playwright/test';
import { createEventGuard } from '../src/features/realtime/event-guard';
import { compareDecimal, formatEth, multiplyDecimal } from '../src/lib/decimal';

function event(eventId: string, id: string, version: number) {
  return { eventId, version, occurredAt: '2026-01-01T00:00:00.000Z', resource: { id } };
}

test('guarda de eventos descarta duplicatas e versões antigas por recurso', () => {
  const guard = createEventGuard();
  expect(guard.accept(event('e1', 'nft-001', 2))).toBe(true);
  expect(guard.accept(event('e1', 'nft-001', 2))).toBe(false);
  expect(guard.accept(event('e0', 'nft-001', 1))).toBe(false);
  expect(guard.accept(event('e2', 'nft-001', 2))).toBe(false);
  expect(guard.accept(event('e3', 'nft-002', 1))).toBe(true);
  expect(guard.accept(event('e4', 'nft-001', 3))).toBe(true);
});

test('aritmética decimal de ETH não perde precisão', () => {
  expect(multiplyDecimal('1.19', 2)).toBe('2.38');
  expect(multiplyDecimal('0.1', 3)).toBe('0.3');
  expect(multiplyDecimal('1.79', 9)).toBe('16.11');
  expect(multiplyDecimal('0.000000000000000001', 3)).toBe('0.000000000000000003');
  expect(compareDecimal('1.290', '1.29')).toBe(0);
  expect(compareDecimal('1.3', '1.29')).toBe(1);
  expect(formatEth('0')).toBe('0.00');
  expect(formatEth('8.92')).toBe('8.92');
  expect(formatEth('0.005', 3)).toBe('0.005');
  expect(formatEth('26.846')).toBe('26.846');
});
