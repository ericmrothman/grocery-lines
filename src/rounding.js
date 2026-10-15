const WHOLE_MINUTES = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, useGrouping: false });

export function wholeMinutes(minutes) {
  return Number.isFinite(minutes) ? Number(WHOLE_MINUTES.format(minutes)) : minutes;
}
