import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

export type DateWindow = {
  year: number;
  takenAfter: string;
  takenBefore: string;
};

export function getTodayInTimezone(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate() ?? DateTime.now().toISODate()!;
}

export function buildDateWindows(forDate: string, timezone: string, yearsBack: number): DateWindow[] {
  const target = DateTime.fromISO(forDate, { zone: timezone });
  if (!target.isValid) {
    throw new Error('Invalid review date');
  }

  const currentYear = target.year;
  const windows: DateWindow[] = [];

  for (let year = currentYear - yearsBack; year < currentYear; year += 1) {
    const dayStart = DateTime.fromObject(
      { year, month: target.month, day: target.day, hour: 0, minute: 0, second: 0, millisecond: 0 },
      { zone: timezone }
    );

    if (!dayStart.isValid) {
      continue;
    }

    const dayEnd = dayStart.endOf('day');
    windows.push({
      year,
      takenAfter: dayStart.toUTC().toISO()!,
      takenBefore: dayEnd.toUTC().toISO()!
    });
  }

  return windows;
}

export function secondsUntilEndOfDay(timezone: string): number {
  const now = DateTime.now().setZone(timezone);
  const end = now.endOf('day');
  return Math.max(60, Math.ceil(end.diff(now, 'seconds').seconds));
}

export function buildQueueHash(input: object): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 12);
}
