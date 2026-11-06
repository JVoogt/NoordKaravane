import { describe, expect, it } from 'vitest';
import { BUSINESS, type DayHours, type DayKey } from '../data/business';
import {
  formatHoursCompact,
  formatHoursSegments,
  formatHoursLines,
  formatHoursProse,
  groupHours,
  hoursToSchema,
} from './hours';

const closedWeek: Record<DayKey, DayHours> = {
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
};

describe('groupHours', () => {
  it('groups the real hours into three runs', () => {
    expect(groupHours(BUSINESS.hours)).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu'], opens: '08:00', closes: '16:00' },
      { days: ['fri'], opens: '08:00', closes: '14:00' },
      { days: ['sat', 'sun'], opens: null, closes: null },
    ]);
  });

  it('groups non-adjacent identical days separately', () => {
    const hours: Record<DayKey, DayHours> = {
      ...closedWeek,
      mon: { opens: '09:00', closes: '12:00' },
      wed: { opens: '09:00', closes: '12:00' },
    };
    const groups = groupHours(hours);
    expect(groups.map((g) => g.days)).toEqual([['mon'], ['tue'], ['wed'], ['thu', 'fri', 'sat', 'sun']]);
  });
});

describe('hoursToSchema', () => {
  it('matches the two objects of the old JSON-LD and omits weekends', () => {
    expect(hoursToSchema(BUSINESS.hours)).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
        opens: '08:00',
        closes: '16:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Friday'],
        opens: '08:00',
        closes: '14:00',
      },
    ]);
  });

  it('is empty for a fully closed week', () => {
    expect(hoursToSchema(closedWeek)).toEqual([]);
  });
});

describe('formatters', () => {
  it('compact equals the old ticker string with en dashes', () => {
    expect(formatHoursCompact(BUSINESS.hours)).toBe('Mon–Thu 08:00–16:00 · Fri 08:00–14:00');
  });

  it('segments are the compact string split per day group, so the footer can keep each unbreakable', () => {
    expect(formatHoursSegments(BUSINESS.hours)).toEqual(['Mon–Thu 08:00–16:00', 'Fri 08:00–14:00']);
  });

  it('lines equal the plan strings', () => {
    expect(formatHoursLines(BUSINESS.hours)).toEqual([
      'Mon to Thu · 08:00 to 16:00',
      'Fri · 08:00 to 14:00',
      'Sat and Sun · closed',
    ]);
  });

  it('prose equals the plan string', () => {
    expect(formatHoursProse(BUSINESS.hours)).toBe(
      'Monday to Thursday 08:00 to 16:00 and Friday 08:00 to 14:00. Closed on weekends.',
    );
  });

  it('a fully closed week reads closed all week and compact is empty', () => {
    expect(formatHoursProse(closedWeek)).toBe('Closed all week.');
    expect(formatHoursCompact(closedWeek)).toBe('');
    expect(formatHoursLines(closedWeek)).toEqual(['Mon to Sun · closed']);
  });

  it('never emits 17:00 for the real hours', () => {
    const all = [
      JSON.stringify(groupHours(BUSINESS.hours)),
      JSON.stringify(hoursToSchema(BUSINESS.hours)),
      formatHoursCompact(BUSINESS.hours),
      formatHoursLines(BUSINESS.hours).join('|'),
      formatHoursProse(BUSINESS.hours),
    ].join('|');
    expect(all).not.toContain('17:00');
  });
});
