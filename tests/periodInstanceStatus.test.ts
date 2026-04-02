import { describe, expect, it } from 'vitest';
import {
  parsePersistedPeriodInstanceStatus,
  parsePeriodInstanceKey,
  updateCompletedInstanceKeys
} from '../src/lib/periodInstances';

describe('period instance status helpers', () => {
  it('parses persisted completion payload safely', () => {
    expect(
      parsePersistedPeriodInstanceStatus({
        completedInstanceKeys: ['weekly:w1:2026-W14', 123],
        updatedAt: '2026-04-02T10:00:00.000Z'
      })
    ).toEqual({
      completedInstanceKeys: ['weekly:w1:2026-W14'],
      updatedAt: '2026-04-02T10:00:00.000Z'
    });
  });

  it('parses instance keys into period metadata', () => {
    expect(parsePeriodInstanceKey('monthly:m1:2026-M04')).toEqual({
      periodType: 'monthly',
      templateId: 'm1',
      periodKey: '2026-M04'
    });
  });

  it('adds and removes completed instance keys idempotently', () => {
    expect(updateCompletedInstanceKeys([], 'weekly:w1:2026-W14', true)).toEqual([
      'weekly:w1:2026-W14'
    ]);
    expect(
      updateCompletedInstanceKeys(['weekly:w1:2026-W14'], 'weekly:w1:2026-W14', false)
    ).toEqual([]);
  });
});
