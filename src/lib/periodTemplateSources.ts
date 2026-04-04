import type { PersistedPeriodTaskInstance } from './periodInstances';

export function cloneTemplateSourceItems<T extends PersistedPeriodTaskInstance>(
  items: readonly T[]
): T[] {
  return items.map((item) => ({ ...item }));
}

export function cloneTemplateSourceItemsByWeek<T extends PersistedPeriodTaskInstance>(
  itemsByWeek: Record<number, readonly T[]>
): Record<number, T[]> {
  const nextItemsByWeek: Record<number, T[]> = {};

  for (const [week, items] of Object.entries(itemsByWeek)) {
    nextItemsByWeek[Number(week)] = cloneTemplateSourceItems(items);
  }

  return nextItemsByWeek;
}
