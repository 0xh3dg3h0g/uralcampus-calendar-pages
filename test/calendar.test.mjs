import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, formatApiDate, formatIsoDate } from "../scripts/lib/dates.mjs";
import { buildEvents, calendarFilePath } from "../scripts/lib/events.mjs";
import { mergeParsedEvents, parseIcsEvents, renderCalendar, renderCalendarFromBlocks } from "../scripts/lib/ics.mjs";

const schedule = [
  {
    date: "01.09.2026",
    day: "ВТ",
    lessons: [
      {
        addition: ["Алферова Л.В."],
        type: "Лекция",
        name: "Основы системного анализа",
        classroom: "321",
        buildings: "Комсомольский проспект 113А",
        timewindow: {
          timebegin: "13:50",
          timeend: "15:20",
          description: "4 пара",
        },
      },
    ],
  },
];

test("formats dates for the Ural Campus API", () => {
  assert.equal(formatApiDate("2026-09-01"), "01-09-2026");
  assert.equal(formatApiDate("01.09.2026"), "01-09-2026");
  assert.equal(formatIsoDate(addMonths("2026-09-01", 6)), "2027-03-01");
});

test("builds stable event payloads", () => {
  const [event] = buildEvents({
    institution: "inueco",
    institutionName: "Университет",
    sourceType: "group",
    sourceTypeLabel: "Группа",
    source: { guid: "group-guid", name: "И-107" },
    schedule,
    timeZone: "Asia/Yekaterinburg",
  });

  assert.equal(event.summary, "Основы системного анализа (Лекция)");
  assert.equal(event.location, "ауд. 321, Комсомольский проспект 113А");
  assert.equal(event.startLocal, "2026-09-01T13:50:00");
  assert.match(event.uid, /^[a-f0-9]{32}@uralcampus-calendar-pages$/);
});

test("uses guid-based calendar paths", () => {
  assert.equal(calendarFilePath("inueco", "group", "abc"), "calendars/inueco/groups/abc.ics");
  assert.equal(calendarFilePath("preco", "teacher", "abc"), "calendars/preco/teachers/abc.ics");
});

test("parses and renders archived events", () => {
  const events = buildEvents({
    institution: "inueco",
    institutionName: "Университет",
    sourceType: "group",
    sourceTypeLabel: "Группа",
    source: { guid: "group-guid", name: "И-107" },
    schedule,
    timeZone: "Asia/Yekaterinburg",
  });
  const ics = renderCalendar(events, {
    now: new Date("2026-09-01T00:00:00Z"),
  });
  const parsed = parseIcsEvents(ics);
  const archived = renderCalendarFromBlocks(mergeParsedEvents(parsed).map((event) => event.block));

  assert.equal(parsed.length, 1);
  assert.match(archived, /BEGIN:VEVENT/);
  assert.match(archived, /DTSTART;TZID=Asia\/Yekaterinburg:20260901T135000/);
});

test("renders identical ICS for unchanged schedules", () => {
  const events = buildEvents({
    institution: "inueco",
    institutionName: "Университет",
    sourceType: "group",
    sourceTypeLabel: "Группа",
    source: { guid: "group-guid", name: "И-107" },
    schedule,
    timeZone: "Asia/Yekaterinburg",
  });

  assert.equal(renderCalendar(events), renderCalendar(events));
});
