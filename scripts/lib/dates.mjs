export const DEFAULT_TIME_ZONE = "Asia/Yekaterinburg";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const API_DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const DISPLAY_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function assertDateParts(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error(`Invalid date: ${JSON.stringify(parts)}`);
  }
  return parts;
}

export function parseDate(value) {
  if (value instanceof Date) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  if (
    value &&
    typeof value === "object" &&
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    Number.isInteger(value.day)
  ) {
    return assertDateParts({
      year: value.year,
      month: value.month,
      day: value.day,
    });
  }

  const text = String(value ?? "").trim();
  let match = text.match(ISO_DATE_RE);
  if (match) {
    return assertDateParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    });
  }

  match = text.match(API_DATE_RE);
  if (match) {
    return assertDateParts({
      year: Number(match[3]),
      month: Number(match[2]),
      day: Number(match[1]),
    });
  }

  match = text.match(DISPLAY_DATE_RE);
  if (match) {
    return assertDateParts({
      year: Number(match[3]),
      month: Number(match[2]),
      day: Number(match[1]),
    });
  }

  throw new Error(`Invalid date "${value}". Use yyyy-mm-dd, dd-mm-yyyy, or dd.mm.yyyy.`);
}

export function todayInTimeZone(timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return parseDate(`${values.year}-${values.month}-${values.day}`);
}

export function addDays(value, days) {
  const date = parseDate(value);
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day));
  result.setUTCDate(result.getUTCDate() + Number(days));
  return parseDate(result);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths(value, months) {
  const date = parseDate(value);
  const targetMonthIndex = date.month - 1 + Number(months);
  const targetYear = date.year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12 + 1;
  const targetDay = Math.min(date.day, daysInMonth(targetYear, targetMonth));

  return parseDate({
    year: targetYear,
    month: targetMonth,
    day: targetDay,
  });
}

export function formatIsoDate(value) {
  const date = parseDate(value);
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

export function formatApiDate(value) {
  const date = parseDate(value);
  return `${pad2(date.day)}-${pad2(date.month)}-${date.year}`;
}

export function formatIcsDate(value) {
  const date = parseDate(value);
  return `${date.year}${pad2(date.month)}${pad2(date.day)}`;
}

export function normalizeTime(value) {
  const match = String(value ?? "").trim().match(TIME_RE);
  if (!match) throw new Error(`Invalid time "${value}". Use HH:mm.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time "${value}". Use HH:mm.`);
  return `${pad2(hours)}:${pad2(minutes)}`;
}

export function formatLocalDateTime(date, time) {
  return `${formatIsoDate(date)}T${normalizeTime(time)}:00`;
}

export function formatIcsLocalDateTime(date, time) {
  return `${formatIcsDate(date)}T${normalizeTime(time).replace(":", "")}00`;
}

export function formatUtcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
