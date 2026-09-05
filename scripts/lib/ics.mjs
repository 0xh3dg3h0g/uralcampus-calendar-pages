import { formatIcsLocalDateTime, formatUtcStamp } from "./dates.mjs";

export const DEFAULT_PRODID = "-//uralcampus-calendar-pages//Schedule//RU";
export const SOURCE_MARKER = "URALCAMPUS_SOURCE:";
export const SYNC_MARKER = "URALCAMPUS_SYNC_ID:";
export const STABLE_DTSTAMP = "19700101T000000Z";

function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line) {
  const chunks = [];
  let current = "";

  for (const char of Array.from(line)) {
    const next = current + char;
    if (Buffer.byteLength(next, "utf8") > 74) {
      chunks.push(current);
      current = ` ${char}`;
    } else {
      current = next;
    }
  }

  chunks.push(current);
  return chunks;
}

function property(name, value) {
  if (value === undefined || value === null || value === "") return [];
  return foldLine(`${name}:${value}`);
}

function timeZoneBlock(timeZone) {
  if (timeZone !== "Asia/Yekaterinburg") return [];
  return [
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Yekaterinburg",
    "X-LIC-LOCATION:Asia/Yekaterinburg",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0500",
    "TZOFFSETTO:+0500",
    "TZNAME:+05",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

export function eventToLines(event, timestamp) {
  return [
    "BEGIN:VEVENT",
    ...property("UID", event.uid),
    ...property("DTSTAMP", timestamp),
    ...property(`DTSTART;TZID=${event.timeZone}`, formatIcsLocalDateTime(event.date, event.timeBegin)),
    ...property(`DTEND;TZID=${event.timeZone}`, formatIcsLocalDateTime(event.date, event.timeEnd)),
    ...property("SUMMARY", escapeIcsText(event.summary)),
    ...property("LOCATION", escapeIcsText(event.location)),
    ...property("DESCRIPTION", escapeIcsText(event.description)),
    "END:VEVENT",
  ];
}

export function renderCalendar(events, options = {}) {
  const timeZone = options.timeZone ?? "Asia/Yekaterinburg";
  const timestamp = options.timestamp ?? (options.now ? formatUtcStamp(options.now) : STABLE_DTSTAMP);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.prodId ?? DEFAULT_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    ...property("X-WR-CALNAME", escapeIcsText(options.calendarName ?? "Расписание Урал Кампус")),
    ...property("X-WR-TIMEZONE", escapeIcsText(timeZone)),
    ...timeZoneBlock(timeZone),
  ];

  for (const event of events) lines.push(...eventToLines(event, timestamp));

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function unfoldIcs(text) {
  return String(text ?? "").replace(/\r?\n[ \t]/g, "");
}

function findProperty(lines, name) {
  return lines.find((line) => line === name || line.startsWith(`${name}:`) || line.startsWith(`${name};`));
}

function propertyValue(line) {
  return line?.slice(line.indexOf(":") + 1) ?? "";
}

function dateKeyFromDtstart(line) {
  const value = propertyValue(line);
  return value.slice(0, 8);
}

function normalizeBlock(block) {
  return block.flatMap(foldLine).join("\r\n");
}

export function parseIcsEvents(text) {
  const lines = unfoldIcs(text).split(/\r?\n/);
  const events = [];
  let inside = false;
  let block = [];

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inside = true;
      block = [line];
      continue;
    }

    if (!inside) continue;

    block.push(line);

    if (line === "END:VEVENT") {
      const uid = propertyValue(findProperty(block, "UID"));
      const startDateKey = dateKeyFromDtstart(findProperty(block, "DTSTART"));
      if (uid && startDateKey) {
        events.push({
          uid,
          startDateKey,
          block: normalizeBlock(block),
        });
      }
      inside = false;
      block = [];
    }
  }

  return events;
}

export function renderCalendarFromBlocks(blocks, options = {}) {
  const timeZone = options.timeZone ?? "Asia/Yekaterinburg";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.prodId ?? DEFAULT_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...property("X-WR-CALNAME", escapeIcsText(options.calendarName ?? "Архив расписания")),
    ...property("X-WR-TIMEZONE", escapeIcsText(timeZone)),
    ...timeZoneBlock(timeZone),
    ...blocks,
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function mergeParsedEvents(events) {
  const byUid = new Map();
  for (const event of events) {
    if (!byUid.has(event.uid)) byUid.set(event.uid, event);
  }
  return [...byUid.values()].sort((left, right) => {
    const byDate = left.startDateKey.localeCompare(right.startDateKey);
    return byDate || left.uid.localeCompare(right.uid);
  });
}
