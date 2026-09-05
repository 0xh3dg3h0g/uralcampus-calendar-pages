export const INSTITUTIONS = [
  {
    id: "inueco",
    name: "Университет",
    apiPath: "university",
  },
  {
    id: "preco",
    name: "Колледж",
    apiPath: "college",
  },
];

export const SOURCE_TYPES = [
  {
    id: "group",
    collection: "groups",
    label: "Группа",
  },
  {
    id: "teacher",
    collection: "teachers",
    label: "Преподаватель",
  },
];

const API_BASE = "https://rasp.ural-campus.ru/api/schedule";

function institutionById(id) {
  const institution = INSTITUTIONS.find((item) => item.id === id);
  if (!institution) throw new Error(`Unknown institution: ${id}`);
  return institution;
}

function sourceTypeById(id) {
  const normalized = String(id).replace(/s$/, "");
  const sourceType = SOURCE_TYPES.find((item) => item.id === normalized);
  if (!sourceType) throw new Error(`Unknown source type: ${id}`);
  return sourceType;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "uralcampus-calendar-pages/0.1",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);

  const data = await response.json();
  if (data.code !== 200 || data.error?.length) {
    throw new Error(`${data.error?.join(", ") || "API error"} (API code: ${data.code})`);
  }
  return data.message;
}

export async function fetchSources(institutionId, sourceTypeId) {
  const institution = institutionById(institutionId);
  const sourceType = sourceTypeById(sourceTypeId);
  const url = `${API_BASE}/${institution.apiPath}/${sourceType.collection}`;
  const data = await fetchJson(url);
  return data[sourceType.collection] ?? [];
}

export async function fetchLessons(institutionId, sourceTypeId, guid, fromApiDate, toApiDate) {
  const institution = institutionById(institutionId);
  const sourceType = sourceTypeById(sourceTypeId);
  const url = `${API_BASE}/${institution.apiPath}/${sourceType.id}/${guid}?datebegin=${fromApiDate}&dateend=${toApiDate}`;
  const data = await fetchJson(url);
  return data.schedule ?? [];
}
