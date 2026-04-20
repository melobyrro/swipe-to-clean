import { describe, expect, it } from 'vitest';
import { buildDateWindows } from './date';

describe('buildDateWindows', () => {
  it('builds exact-day windows for the last N years and excludes the current year', () => {
    const windows = buildDateWindows('2026-04-17', 'America/New_York', 3);

    expect(windows.map((window) => window.year)).toEqual([2023, 2024, 2025]);
    expect(windows.some((window) => window.year === 2026)).toBe(false);
  });

  it('skips invalid leap-day years', () => {
    const windows = buildDateWindows('2024-02-29', 'UTC', 4);
    expect(windows.map((window) => window.year)).toEqual([2020]);
  });
});
