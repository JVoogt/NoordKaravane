import { DAY_ORDER, type DayHours, type DayKey } from '../data/business';

export interface HoursGroup {
  days: DayKey[];
  opens: string | null;
  closes: string | null;
}

type Hours = Record<DayKey, DayHours>;

const SHORT: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const LONG: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const EN_DASH = '–';
const MIDDOT = '·';

/** Runs of adjacent days with identical hours, in week order. Closed days have opens and closes null. */
export function groupHours(hours: Hours): HoursGroup[] {
  const groups: HoursGroup[] = [];
  for (const day of DAY_ORDER) {
    const h = hours[day];
    const opens = h ? h.opens : null;
    const closes = h ? h.closes : null;
    const last = groups[groups.length - 1];
    if (last && last.opens === opens && last.closes === closes) last.days.push(day);
    else groups.push({ days: [day], opens, closes });
  }
  return groups;
}

export function hoursToSchema(hours: Hours): Array<{
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: string[];
  opens: string;
  closes: string;
}> {
  return groupHours(hours)
    .filter((g) => g.opens !== null && g.closes !== null)
    .map((g) => ({
      '@type': 'OpeningHoursSpecification' as const,
      dayOfWeek: g.days.map((d) => LONG[d]),
      opens: g.opens as string,
      closes: g.closes as string,
    }));
}

/** ['Mon–Thu 08:00–16:00', 'Fri 08:00–14:00'] (closed days omitted). */
export function formatHoursSegments(hours: Hours): string[] {
  return groupHours(hours)
    .filter((g) => g.opens !== null)
    .map((g) => {
      const first = SHORT[g.days[0]];
      const last = SHORT[g.days[g.days.length - 1]];
      const label = g.days.length === 1 ? first : `${first}${EN_DASH}${last}`;
      return `${label} ${g.opens}${EN_DASH}${g.closes}`;
    });
}

/** 'Mon–Thu 08:00–16:00 · Fri 08:00–14:00' (closed days omitted). */
export function formatHoursCompact(hours: Hours): string {
  return formatHoursSegments(hours).join(` ${MIDDOT} `);
}

function shortLabel(days: DayKey[]): string {
  if (days.length === 1) return SHORT[days[0]];
  if (days.length === 2) return `${SHORT[days[0]]} and ${SHORT[days[1]]}`;
  return `${SHORT[days[0]]} to ${SHORT[days[days.length - 1]]}`;
}

/** One line per group, for the Hours component. */
export function formatHoursLines(hours: Hours): string[] {
  return groupHours(hours).map((g) =>
    g.opens !== null ? `${shortLabel(g.days)} ${MIDDOT} ${g.opens} to ${g.closes}` : `${shortLabel(g.days)} ${MIDDOT} closed`,
  );
}

function longLabel(days: DayKey[]): string {
  if (days.length === 1) return LONG[days[0]];
  if (days.length === 2) return `${LONG[days[0]]} and ${LONG[days[1]]}`;
  return `${LONG[days[0]]} to ${LONG[days[days.length - 1]]}`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Sentence form for FAQ answers. */
export function formatHoursProse(hours: Hours): string {
  const groups = groupHours(hours);
  const open = groups.filter((g) => g.opens !== null);
  const closed = groups.filter((g) => g.opens === null);
  if (open.length === 0) return 'Closed all week.';
  const openText = joinAnd(open.map((g) => `${longLabel(g.days)} ${g.opens} to ${g.closes}`)) + '.';
  if (closed.length === 0) return openText;
  const closedText = closed
    .map((g) => (g.days.length === 2 && g.days[0] === 'sat' && g.days[1] === 'sun' ? 'weekends' : longLabel(g.days)))
    .join(' and ');
  return `${openText} Closed on ${closedText}.`;
}
