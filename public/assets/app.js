const state = {
  catalog: null,
  type: "group",
  institution: "inueco",
  entries: [],
  selected: null,
};

const refs = {
  institution: document.querySelector("#institution"),
  typeButtons: [...document.querySelectorAll("[data-type]")],
  search: document.querySelector("#search"),
  entries: document.querySelector("#entries"),
  status: document.querySelector("#status"),
  selected: document.querySelector("#selected"),
  selectedType: document.querySelector("#selected-type"),
  selectedName: document.querySelector("#selected-name"),
  selectedMeta: document.querySelector("#selected-meta"),
  calendarUrl: document.querySelector("#calendar-url"),
  copy: document.querySelector("#copy"),
  openIcs: document.querySelector("#open-ics"),
  webcal: document.querySelector("#webcal"),
  google: document.querySelector("#google"),
  outlook: document.querySelector("#outlook"),
  archive: document.querySelector("#archive"),
};

function absoluteUrl(relativePath) {
  return new URL(relativePath, window.location.href).href;
}

function webcalUrl(url) {
  return url.replace(/^https?:\/\//, "webcal://");
}

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("ru-RU").trim();
}

function formatDate(value) {
  if (!value) return "дата обновления пока недоступна";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderInstitutions() {
  refs.institution.innerHTML = "";
  for (const institution of state.catalog.institutions) {
    const option = document.createElement("option");
    option.value = institution.id;
    option.textContent = institution.name;
    refs.institution.append(option);
  }
  refs.institution.value = state.institution;
}

function filteredEntries() {
  const query = normalize(refs.search.value);
  return state.catalog.entries
    .filter((entry) => entry.institution === state.institution)
    .filter((entry) => entry.type === state.type)
    .filter((entry) => {
      if (!query) return true;
      return normalize(`${entry.name} ${entry.guid}`).includes(query);
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

function renderEntryOptions() {
  state.entries = filteredEntries();
  refs.entries.innerHTML = "";

  if (state.entries.length === 0) {
    refs.status.textContent = "Для выбранных условий пока нет календарей.";
    refs.status.className = "status warning";
    refs.selected.classList.add("hidden");
    return;
  }

  for (const [index, entry] of state.entries.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = entry.name;
    refs.entries.append(option);
  }

  refs.entries.value = "0";
  selectEntry(state.entries[0]);
}

function selectEntry(entry) {
  state.selected = entry;
  const url = absoluteUrl(entry.path);
  const archiveUrl = absoluteUrl(entry.archivePath);
  const isStale = entry.status === "stale";

  refs.status.textContent = isStale
    ? "Последнее обновление этого расписания не прошло, показываю предыдущий опубликованный файл."
    : `Каталог обновлен: ${formatDate(state.catalog.generatedAt)}`;
  refs.status.className = isStale ? "status warning" : "status";

  refs.selected.classList.remove("hidden");
  refs.selectedType.textContent = `${entry.institutionName} · ${entry.typeLabel}`;
  refs.selectedName.textContent = entry.name;
  refs.selectedMeta.textContent = `${entry.eventCount} событий · ${state.catalog.horizon.start} — ${state.catalog.horizon.end}`;
  refs.calendarUrl.value = url;
  refs.openIcs.href = url;
  refs.webcal.href = webcalUrl(url);
  refs.google.href = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(url)}`;
  refs.outlook.href = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}`;
  refs.archive.href = archiveUrl;
}

function bindEvents() {
  refs.institution.addEventListener("change", () => {
    state.institution = refs.institution.value;
    renderEntryOptions();
  });

  refs.typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      refs.typeButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderEntryOptions();
    });
  });

  refs.search.addEventListener("input", renderEntryOptions);

  refs.entries.addEventListener("change", () => {
    selectEntry(state.entries[Number(refs.entries.value)]);
  });

  refs.copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(refs.calendarUrl.value);
    const previous = refs.copy.textContent;
    refs.copy.textContent = "Скопировано";
    setTimeout(() => {
      refs.copy.textContent = previous;
    }, 1400);
  });
}

async function loadCatalog() {
  try {
    const response = await fetch("data/catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.catalog = await response.json();
    state.institution = state.catalog.institutions[0]?.id ?? "inueco";
    renderInstitutions();
    renderEntryOptions();
  } catch (error) {
    refs.status.textContent = `Не удалось загрузить каталог расписаний: ${error.message}`;
    refs.status.className = "status warning";
  }
}

bindEvents();
loadCatalog();
