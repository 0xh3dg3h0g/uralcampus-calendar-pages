import { createHash } from "node:crypto";
import { formatIcsDate, formatIsoDate, formatLocalDateTime } from "./dates.mjs";
import { SOURCE_MARKER, SYNC_MARKER } from "./ics.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function eventHash(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function buildSummary(lesson) {
  const name = clean(lesson.name) || "Занятие";
  const type = clean(lesson.type);
  return type ? `${name} (${type})` : name;
}

function buildLocation(lesson) {
  const classroom = clean(lesson.classroom);
  const building = clean(lesson.buildings);
  return [classroom ? `ауд. ${classroom}` : "", building].filter(Boolean).join(", ");
}

function optionalLine(label, value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : clean(value);
  return text ? `${label}: ${text}` : null;
}

export function buildEvents({ institution, institutionName, sourceType, sourceTypeLabel, source, schedule, timeZone }) {
  const events = [];
  const sourceKey = `${institution}:${sourceType}:${source.guid}`;

  for (const day of schedule) {
    for (const lesson of day.lessons ?? []) {
      const timeBegin = lesson.timewindow?.timebegin;
      const timeEnd = lesson.timewindow?.timeend;
      if (!timeBegin || !timeEnd) continue;

      const syncId = eventHash([
        institution,
        sourceType,
        source.guid,
        day.date,
        timeBegin,
        timeEnd,
        lesson.name,
        lesson.type,
        lesson.classroom,
        lesson.buildings,
        lesson.addition ?? [],
      ]);

      const description = [
        `Источник: Урал Кампус (${institutionName})`,
        optionalLine(sourceTypeLabel, source.name),
        optionalLine("Пара", lesson.timewindow?.description),
        optionalLine("Дополнительно", lesson.addition),
        `${SYNC_MARKER}${syncId}`,
        `${SOURCE_MARKER}${sourceKey}`,
      ].filter(Boolean).join("\n");

      events.push({
        uid: `${syncId}@uralcampus-calendar-pages`,
        syncId,
        sourceKey,
        timeZone,
        date: day.date,
        dateKey: formatIcsDate(day.date),
        startLocal: formatLocalDateTime(day.date, timeBegin),
        endLocal: formatLocalDateTime(day.date, timeEnd),
        timeBegin,
        timeEnd,
        summary: buildSummary(lesson),
        location: buildLocation(lesson),
        description,
      });
    }
  }

  return [...new Map(events.map((event) => [event.uid, event])).values()].sort((left, right) => {
    const byStart = left.startLocal.localeCompare(right.startLocal);
    return byStart || left.summary.localeCompare(right.summary, "ru");
  });
}

export function calendarFilePath(institution, sourceType, guid) {
  const collection = sourceType === "teacher" ? "teachers" : "groups";
  return `calendars/${institution}/${collection}/${guid}.ics`;
}

export function calendarName(sourceTypeLabel, sourceName) {
  return `${sourceTypeLabel}: ${sourceName}`;
}

export function catalogEntry({ institution, institutionName, sourceType, sourceTypeLabel, source, path, eventCount, status, error }) {
  return {
    institution,
    institutionName,
    type: sourceType,
    typeLabel: sourceTypeLabel,
    name: source.name,
    guid: source.guid,
    path,
    archivePath: `${path}.old`,
    eventCount,
    status,
    error,
  };
}
