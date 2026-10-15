const DAYTON_TIME_ZONE = 'America/New_York';
const WEEKDAY_NUMBERS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const FULL_OR_ABBREVIATED_DAY_NAME = '(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)s?\\.?';
const DAY_NAME_PATTERN = new RegExp(`\\b${FULL_OR_ABBREVIATED_DAY_NAME}(?![a-z])`, 'gi');
const DAY_RANGE_PATTERN = new RegExp(`\\b${FULL_OR_ABBREVIATED_DAY_NAME}\\s*(?:-|–|through|thru|to)\\s*${FULL_OR_ABBREVIATED_DAY_NAME}(?![a-z])`, 'i');
const WEEK_OF_MONTH_BY_ORDINAL = { '1st': 1, first: 1, '2nd': 2, second: 2, '3rd': 3, third: 3, '4th': 4, fourth: 4, '5th': 5, fifth: 5, last: 'last' };
const ORDINAL_PATTERN = /\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last)\b/gi;
const TIME_RANGE_PATTERN = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/gi;
const UNREADABLE_SCHEDULE_PATTERN = /appointment|call|varies|seasonal|tbd|holiday|closed|bi-?weekly|every other|if there are/i;

function minutesSinceMidnight(hour, minute, meridiem) {
  const isAfternoon = meridiem.toLowerCase().startsWith('p');
  return ((Number(hour) % 12) + (isAfternoon ? 12 : 0)) * 60 + Number(minute || 0);
}

function parseTimeRange([, openingHour, openingMinute, openingMeridiem, closingHour, closingMinute, closingMeridiem]) {
  const close = minutesSinceMidnight(closingHour, closingMinute, closingMeridiem);
  let open = minutesSinceMidnight(openingHour, openingMinute, openingMeridiem || closingMeridiem);
  const borrowedClosingMeridiemPutsOpeningAfterClosing = !openingMeridiem && open >= close;
  if (borrowedClosingMeridiemPutsOpeningAfterClosing) open = minutesSinceMidnight(openingHour, openingMinute, 'am');
  return open < close ? { open, close } : null;
}

function weekdaysFromFirstToLast(firstWeekday, lastWeekday) {
  const weekdays = new Set();
  for (let weekday = firstWeekday; ; weekday = (weekday + 1) % 7) {
    weekdays.add(weekday);
    if (weekday === lastWeekday) break;
  }
  return weekdays;
}

function parseDays(text) {
  const namedWeekdays = [...text.matchAll(DAY_NAME_PATTERN)].map((dayMatch) => WEEKDAY_NUMBERS[dayMatch[0].slice(0, 3).toLowerCase()]);
  if (namedWeekdays.length === 0) return null;
  const isRangeOfTwoDays = namedWeekdays.length === 2 && DAY_RANGE_PATTERN.test(text);
  const days = isRangeOfTwoDays ? weekdaysFromFirstToLast(namedWeekdays[0], namedWeekdays[1]) : new Set(namedWeekdays);
  const weeksOfMonth = [...text.matchAll(ORDINAL_PATTERN)].map((ordinalMatch) => WEEK_OF_MONTH_BY_ORDINAL[ordinalMatch[1].toLowerCase()]);
  return { days, weeks: weeksOfMonth.length ? new Set(weeksOfMonth) : null };
}

function parseClause(clause) {
  const rules = [];
  let daysOfLatestRange = null;
  let textSinceLatestRangeStartsAt = 0;
  for (const timeRangeMatch of clause.matchAll(TIME_RANGE_PATTERN)) {
    const daysWrittenBeforeThisRange = parseDays(clause.slice(textSinceLatestRangeStartsAt, timeRangeMatch.index));
    daysOfLatestRange = daysWrittenBeforeThisRange ?? daysOfLatestRange;
    const hours = parseTimeRange(timeRangeMatch);
    if (!daysOfLatestRange || !hours) return null;
    rules.push({ ...daysOfLatestRange, ...hours });
    textSinceLatestRangeStartsAt = timeRangeMatch.index + timeRangeMatch[0].length;
  }
  return rules.length ? rules : null;
}

export function parseSchedule(text) {
  if (!text || !text.trim() || UNREADABLE_SCHEDULE_PATTERN.test(text)) return null;
  const clauses = text.split(/[;\n|/]+/).map((clause) => clause.trim()).filter(Boolean);
  const rulesByClause = clauses.map(parseClause);
  return rulesByClause.every(Boolean) ? rulesByClause.flat() : null;
}

function daytonCalendarAt(instant) {
  const formattedParts = new Intl.DateTimeFormat('en-US', {
    timeZone: DAYTON_TIME_ZONE, weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(instant);
  const parts = Object.fromEntries(formattedParts.map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const dayOfMonth = Number(parts.day);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    weekday: WEEKDAY_NUMBERS[parts.weekday.toLowerCase()],
    weekOfMonth: Math.ceil(dayOfMonth / 7),
    isLastOfMonth: dayOfMonth + 7 > daysInMonth,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function formatClockTime(minutesAfterMidnight) {
  const hour = Math.floor(minutesAfterMidnight / 60);
  const minute = minutesAfterMidnight % 60;
  const minuteText = minute ? `:${String(minute).padStart(2, '0')}` : '';
  return `${hour % 12 || 12}${minuteText} ${hour < 12 ? 'AM' : 'PM'}`;
}

function ruleCovers(rule, now) {
  const weekMatches = !rule.weeks || rule.weeks.has(now.weekOfMonth) || (rule.weeks.has('last') && now.isLastOfMonth);
  return rule.days.has(now.weekday) && weekMatches && now.minutes >= rule.open && now.minutes < rule.close;
}

export function openStatus(scheduleText, instant) {
  const raw = scheduleText ?? null;
  const rules = parseSchedule(scheduleText);
  if (!rules) return { state: 'unknown', raw };
  const now = daytonCalendarAt(instant);
  const openRule = rules.find((rule) => ruleCovers(rule, now));
  if (openRule) return { state: 'open', until: formatClockTime(openRule.close), raw };
  return { state: 'closed', raw };
}
