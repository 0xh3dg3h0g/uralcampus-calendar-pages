import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_TIME_ZONE,
  addMonths,
  formatApiDate,
  formatIsoDate,
  formatIcsDate,
  parseDate,
  todayInTimeZone,
} from "./lib/dates.mjs";
import { buildEvents, calendarFilePath, calendarName, catalogEntry } from "./lib/events.mjs";
import { INSTITUTIONS, SOURCE_TYPES, fetchLessons, fetchSources } from "./lib/uralCampusApi.mjs";
import { mergeParsedEvents, parseIcsEvents, renderCalendar, renderCalendarFromBlocks } from "./lib/ics.mjs";

const DEFAULT_MONTHS = 6;

function parseArgs(argv) {
  const options = {
    output: "public",
    months: DEFAULT_MONTHS,
    concurrency: 4,
    timeZone: DEFAULT_TIME_ZONE,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);

    const [name, inlineValue] = arg.slice(2).split("=", 2);
    if (name === "dry-run") {
      options.dryRun = true;
      continue;
    }

    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    options[name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
  }

  options.months = Number(options.months);
  options.concurrency = Number(options.concurrency);
  if (!Number.isInteger(options.months) || options.months < 1) throw new Error("--months must be a positive integer.");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error("--concurrency must be a positive integer.");
  return options;
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeIfChanged(file, content, dryRun) {
  const current = await readText(file);
  if (current === content) return "unchanged";
  if (dryRun) return current === null ? "would-create" : "would-update";

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return current === null ? "created" : "updated";
}

function normalizeType(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(/s$/, "");
  if (normalized !== "group" && normalized !== "teacher") throw new Error("--type must be group or teacher.");
  return normalized;
}

function sourceMatches(source, options) {
  if (options.guid && source.guid !== options.guid) return false;
  if (options.name && source.name.toLocaleLowerCase("ru-RU") !== String(options.name).toLocaleLowerCase("ru-RU")) return false;
  return true;
}

async function mapLimited(items, limit, worker) {
  const results = [];
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function mergeArchiveEvents(previousArchiveText, previousCurrentText, cutoffDateKey) {
  const previousArchive = parseIcsEvents(previousArchiveText ?? "");
  const previousCurrentPast = parseIcsEvents(previousCurrentText ?? "").filter((event) => event.startDateKey < cutoffDateKey);
  return mergeParsedEvents([...previousArchive, ...previousCurrentPast]);
}

async function processSource({ institution, sourceType, source, options, range, totals }) {
  const relativePath = calendarFilePath(institution.id, sourceType.id, source.guid);
  const currentPath = path.join(options.output, relativePath);
  const archivePath = `${currentPath}.old`;
  const previousCurrentText = await readText(currentPath);
  const previousArchiveText = await readText(archivePath);

  try {
    const schedule = await fetchLessons(
      institution.id,
      sourceType.id,
      source.guid,
      range.apiStart,
      range.apiEnd,
    );
    const events = buildEvents({
      institution: institution.id,
      institutionName: institution.name,
      sourceType: sourceType.id,
      sourceTypeLabel: sourceType.label,
      source,
      schedule,
      timeZone: options.timeZone,
    });

    const currentText = renderCalendar(events, {
      calendarName: calendarName(sourceType.label, source.name),
      timeZone: options.timeZone,
    });
    const currentWrite = await writeIfChanged(currentPath, currentText, options.dryRun);
    totals[currentWrite] = (totals[currentWrite] ?? 0) + 1;

    const archivedEvents = mergeArchiveEvents(previousArchiveText, previousCurrentText, range.cutoffDateKey);
    if (archivedEvents.length > 0) {
      const archiveText = renderCalendarFromBlocks(archivedEvents.map((event) => event.block), {
        calendarName: `Архив: ${calendarName(sourceType.label, source.name)}`,
        timeZone: options.timeZone,
      });
      const archiveWrite = await writeIfChanged(archivePath, archiveText, options.dryRun);
      totals[`archive-${archiveWrite}`] = (totals[`archive-${archiveWrite}`] ?? 0) + 1;
    }

    return catalogEntry({
      institution: institution.id,
      institutionName: institution.name,
      sourceType: sourceType.id,
      sourceTypeLabel: sourceType.label,
      source,
      path: relativePath,
      eventCount: events.length,
      archiveEventCount: archivedEvents.length,
      status: "ok",
    });
  } catch (error) {
    totals.errors++;
    const previousEvents = parseIcsEvents(previousCurrentText ?? "");
    const previousArchiveEvents = parseIcsEvents(previousArchiveText ?? "");
    console.error(`[error] ${institution.id}/${sourceType.id}/${source.name}: ${error.message}`);
    return catalogEntry({
      institution: institution.id,
      institutionName: institution.name,
      sourceType: sourceType.id,
      sourceTypeLabel: sourceType.label,
      source,
      path: relativePath,
      eventCount: previousEvents.length,
      archiveEventCount: previousArchiveEvents.length,
      status: previousCurrentText ? "stale" : "error",
      error: error.message,
    });
  }
}

async function collectJobs(options) {
  const jobs = [];
  const selectedInstitution = options.institution;
  const selectedType = normalizeType(options.type);

  for (const institution of INSTITUTIONS) {
    if (selectedInstitution && institution.id !== selectedInstitution) continue;

    for (const sourceType of SOURCE_TYPES) {
      if (selectedType && sourceType.id !== selectedType) continue;

      const sources = await fetchSources(institution.id, sourceType.id);
      const selected = sources.filter((source) => sourceMatches(source, options));
      const limited = options.limit ? selected.slice(0, Number(options.limit)) : selected;
      console.log(`[catalog] ${institution.id}/${sourceType.id}: ${limited.length} of ${sources.length}`);

      for (const source of limited) jobs.push({ institution, sourceType, source });
    }
  }

  return jobs;
}

async function writeCatalog(options, range, entries) {
  const catalog = {
    generatedAt: new Date().toISOString(),
    timeZone: options.timeZone,
    horizon: {
      start: range.startIso,
      end: range.endIso,
      months: options.months,
    },
    institutions: INSTITUTIONS.map(({ id, name }) => ({ id, name })),
    entries: entries.sort((left, right) => {
      const byInstitution = left.institution.localeCompare(right.institution);
      const byType = left.type.localeCompare(right.type);
      const byName = left.name.localeCompare(right.name, "ru");
      return byInstitution || byType || byName;
    }),
  };

  const catalogPath = path.join(options.output, "data", "catalog.json");
  return writeIfChanged(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, options.dryRun);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const start = options.from ? parseDate(options.from) : todayInTimeZone(options.timeZone);
  const end = options.to ? parseDate(options.to) : addMonths(start, options.months);
  const range = {
    startIso: formatIsoDate(start),
    endIso: formatIsoDate(end),
    apiStart: formatApiDate(start),
    apiEnd: formatApiDate(end),
    cutoffDateKey: formatIcsDate(start),
  };

  const jobs = await collectJobs(options);
  if (jobs.length === 0) throw new Error("No matching groups or teachers.");

  const totals = { errors: 0 };
  const entries = await mapLimited(jobs, options.concurrency, (job) => processSource({
    ...job,
    options,
    range,
    totals,
  }));
  const catalogWrite = await writeCatalog(options, range, entries);

  console.log(`[done] calendars=${entries.length} catalog=${catalogWrite} errors=${totals.errors}`);
  console.log(`[done] writes=${JSON.stringify(totals)}`);

  if (totals.errors === entries.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
