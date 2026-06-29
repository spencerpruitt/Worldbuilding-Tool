// The .map serialized contract, named exactly once.
//
// A .map file is a single top-level array joined by CRLF and read back by raw
// position. A handful of those positions are themselves compound: `params`,
// `settings`, and `biomes` are `|`-delimited sub-records, and `namesData` is a
// `/`-delimited list of `|`-delimited records. Historically save.ts hand-ordered
// the array and load.ts hand-indexed it (`data[33]`, `settings[24]`) ~600 lines
// apart, with the meaning of each index living nowhere.
//
// This module is the single home for that positional contract: one ordered field
// declaration drives both directions, so save and load can never disagree on the
// order. It is deliberately PURE — string <-> named record only, no DOM, no
// `pack`/`grid`/`options`, no JSON parsing (the JSON slots stay raw strings here;
// parsing/stringifying and applying values to app state stay in load.ts/save.ts).
//
// Compatibility is absolute: positions, the CRLF top-level delimiter, the inner
// `|`/`/` delimiters, and every dead slot are preserved exactly. Dead positions
// are named `reserved*` rather than dropped — removing them is a future MAJOR
// `.map` break, not this change.

// ---------------------------------------------------------------------------
// Named sub-records of the compound slots
// ---------------------------------------------------------------------------

// params slot — 7 fields joined by "|".
export interface MapParams {
  version: string;
  license: string;
  date: string;
  seed: string;
  graphWidth: string;
  graphHeight: string;
  mapId: string;
}

// settings slot — 27 fields joined by "|", including eight reserved placeholders
// kept from removed features (old scale-bar inputs and the old temperature
// outputs) so that later positions never shift.
export interface MapSettings {
  distanceUnit: string;
  distanceScale: string;
  areaUnit: string;
  heightUnit: string;
  heightExponent: string;
  temperatureScale: string;
  reservedBarSize: string;
  reservedBarLabel: string;
  reservedBarBackColor1: string;
  reservedBarBackColor2: string;
  reservedBarPosX: string;
  reservedBarPosY: string;
  populationRate: string;
  urbanization: string;
  mapSize: string;
  latitude: string;
  reservedTemperatureEquator: string;
  reservedTemperatureNorth: string;
  prec: string;
  options: string;
  mapName: string;
  hideLabels: string;
  stylePreset: string;
  rescaleLabels: string;
  urbanDensity: string;
  longitude: string;
  growthRate: string;
}

// biomes slot — 3 fields joined by "|" (each is itself a comma-joined list, but
// that inner detail belongs to load.ts/save.ts, not the positional contract).
export interface MapBiomes {
  color: string;
  habitability: string;
  name: string;
}

// One entry of the namesData slot — 6 fields joined by "|".
export interface NameBaseRecord {
  name: string;
  min: string;
  max: string;
  d: string;
  m: string;
  names: string;
}

// ---------------------------------------------------------------------------
// The full named record
// ---------------------------------------------------------------------------

// Every top-level slot of the .map array, named. Plain slots are raw strings
// (JSON slots stay stringified here). The trailing slots marked optional were
// added after the supported floor, so older saves legitimately omit them.
export interface MapRecord {
  params: MapParams;
  settings: MapSettings;
  coords: string;
  biomes: MapBiomes;
  notes: string;
  svg: string;
  gridGeneral: string;
  gridCellsH: string;
  gridCellsPrec: string;
  gridCellsF: string;
  gridCellsT: string;
  gridCellsTemp: string;
  packFeatures: string;
  cultures: string;
  states: string;
  burgs: string;
  cellsBiome: string;
  cellsBurg: string;
  cellsConf: string;
  cellsCulture: string;
  cellsFl: string;
  cellsPop: string;
  cellsR: string;
  reservedRoad: string; // deprecated pack.cells.road, kept as ""
  cellsS: string;
  cellsState: string;
  cellsReligion: string;
  cellsProvince: string;
  reservedCrossroad: string; // deprecated pack.cells.crossroad, kept as ""
  religions: string;
  provinces: string;
  namesData: NameBaseRecord[];
  rivers: string;
  rulers: string;
  fonts: string;
  markers: string;
  cellRoutes: string;
  routes: string;
  zones: string;
  ice: string;
  cellsGood?: string;
  goods?: string;
  markets?: string;
  deals?: string;
  cellsMarket?: string;
  customGoodIcons?: string;
}

// ---------------------------------------------------------------------------
// Generic positional split/join over a delimiter
// ---------------------------------------------------------------------------

// Split a delimiter-joined string into named fields by position. Positions
// absent from the input (a shorter array from an older save) are left undefined.
function splitNamed<Key extends string>(
  raw: string,
  delimiter: string,
  keys: readonly Key[]
): Record<Key, string | undefined> {
  const parts = raw.split(delimiter);
  const record = {} as Record<Key, string | undefined>;
  keys.forEach((key, index) => {
    record[key] = index < parts.length ? parts[index] : undefined;
  });
  return record;
}

// Join named fields back into a delimiter-joined string. Trailing absent
// (undefined) fields are trimmed — that is how a shorter older array is
// reproduced. A hole (an undefined field with a present field after it) is a
// corrupt record and throws rather than silently writing bad data.
function joinNamed<Key extends string>(
  record: Record<Key, string | undefined>,
  delimiter: string,
  keys: readonly Key[],
  context: string
): string {
  const values = keys.map(key => record[key]);

  let lastPresent = -1;
  for (let index = 0; index < values.length; index++) {
    if (values[index] !== undefined) lastPresent = index;
  }

  for (let index = 0; index <= lastPresent; index++) {
    if (values[index] === undefined) {
      throw new Error(
        `Cannot serialize .map data: ${context} field "${keys[index]}" (position ${index}) is missing while a later field is present.`
      );
    }
  }

  return values.slice(0, lastPresent + 1).join(delimiter);
}

// ---------------------------------------------------------------------------
// Codecs for the compound slots
// ---------------------------------------------------------------------------

// A slot codec turns one top-level slot string into its named value and back.
interface SlotCodec {
  parse(raw: string): unknown;
  serialize(value: unknown): string;
}

// A plain slot is its own raw string in both directions.
const plainCodec: SlotCodec = {
  parse: raw => raw,
  serialize: value => value as string
};

const PARAMS_KEYS = ["version", "license", "date", "seed", "graphWidth", "graphHeight", "mapId"] as const;

const SETTINGS_KEYS = [
  "distanceUnit",
  "distanceScale",
  "areaUnit",
  "heightUnit",
  "heightExponent",
  "temperatureScale",
  "reservedBarSize",
  "reservedBarLabel",
  "reservedBarBackColor1",
  "reservedBarBackColor2",
  "reservedBarPosX",
  "reservedBarPosY",
  "populationRate",
  "urbanization",
  "mapSize",
  "latitude",
  "reservedTemperatureEquator",
  "reservedTemperatureNorth",
  "prec",
  "options",
  "mapName",
  "hideLabels",
  "stylePreset",
  "rescaleLabels",
  "urbanDensity",
  "longitude",
  "growthRate"
] as const;

const BIOMES_KEYS = ["color", "habitability", "name"] as const;

const NAME_BASE_KEYS = ["name", "min", "max", "d", "m", "names"] as const;

const paramsCodec: SlotCodec = {
  parse: raw => splitNamed(raw, "|", PARAMS_KEYS),
  serialize: value => joinNamed(value as Record<(typeof PARAMS_KEYS)[number], string>, "|", PARAMS_KEYS, "params")
};

const settingsCodec: SlotCodec = {
  parse: raw => splitNamed(raw, "|", SETTINGS_KEYS),
  serialize: value => joinNamed(value as Record<(typeof SETTINGS_KEYS)[number], string>, "|", SETTINGS_KEYS, "settings")
};

const biomesCodec: SlotCodec = {
  parse: raw => splitNamed(raw, "|", BIOMES_KEYS),
  serialize: value => joinNamed(value as Record<(typeof BIOMES_KEYS)[number], string>, "|", BIOMES_KEYS, "biomes")
};

// namesData is a "/"-joined list of "|"-joined records.
const namesDataCodec: SlotCodec = {
  parse: raw => raw.split("/").map(record => splitNamed(record, "|", NAME_BASE_KEYS)),
  serialize: value =>
    (value as Record<(typeof NAME_BASE_KEYS)[number], string>[])
      .map(record => joinNamed(record, "|", NAME_BASE_KEYS, "namesData"))
      .join("/")
};

// ---------------------------------------------------------------------------
// The single ordered field declaration — source of truth for both directions
// ---------------------------------------------------------------------------

interface TopLevelField {
  readonly key: keyof MapRecord;
  readonly codec: SlotCodec;
}

const TOP_LEVEL_FIELDS: readonly TopLevelField[] = [
  { key: "params", codec: paramsCodec },
  { key: "settings", codec: settingsCodec },
  { key: "coords", codec: plainCodec },
  { key: "biomes", codec: biomesCodec },
  { key: "notes", codec: plainCodec },
  { key: "svg", codec: plainCodec },
  { key: "gridGeneral", codec: plainCodec },
  { key: "gridCellsH", codec: plainCodec },
  { key: "gridCellsPrec", codec: plainCodec },
  { key: "gridCellsF", codec: plainCodec },
  { key: "gridCellsT", codec: plainCodec },
  { key: "gridCellsTemp", codec: plainCodec },
  { key: "packFeatures", codec: plainCodec },
  { key: "cultures", codec: plainCodec },
  { key: "states", codec: plainCodec },
  { key: "burgs", codec: plainCodec },
  { key: "cellsBiome", codec: plainCodec },
  { key: "cellsBurg", codec: plainCodec },
  { key: "cellsConf", codec: plainCodec },
  { key: "cellsCulture", codec: plainCodec },
  { key: "cellsFl", codec: plainCodec },
  { key: "cellsPop", codec: plainCodec },
  { key: "cellsR", codec: plainCodec },
  { key: "reservedRoad", codec: plainCodec },
  { key: "cellsS", codec: plainCodec },
  { key: "cellsState", codec: plainCodec },
  { key: "cellsReligion", codec: plainCodec },
  { key: "cellsProvince", codec: plainCodec },
  { key: "reservedCrossroad", codec: plainCodec },
  { key: "religions", codec: plainCodec },
  { key: "provinces", codec: plainCodec },
  { key: "namesData", codec: namesDataCodec },
  { key: "rivers", codec: plainCodec },
  { key: "rulers", codec: plainCodec },
  { key: "fonts", codec: plainCodec },
  { key: "markers", codec: plainCodec },
  { key: "cellRoutes", codec: plainCodec },
  { key: "routes", codec: plainCodec },
  { key: "zones", codec: plainCodec },
  { key: "ice", codec: plainCodec },
  { key: "cellsGood", codec: plainCodec },
  { key: "goods", codec: plainCodec },
  { key: "markets", codec: plainCodec },
  { key: "deals", codec: plainCodec },
  { key: "cellsMarket", codec: plainCodec },
  { key: "customGoodIcons", codec: plainCodec }
];

// ---------------------------------------------------------------------------
// Public codec
// ---------------------------------------------------------------------------

// Parse a raw .map string into a named record. The top-level array is split on
// CRLF and each slot routed through its codec by position. TOP_LEVEL_FIELDS is
// the single source of order; MapRecord names the resulting field types.
export function splitMapData(raw: string): MapRecord {
  const slots = raw.split("\r\n");
  const record: Record<string, unknown> = {};

  TOP_LEVEL_FIELDS.forEach((field, index) => {
    const slot = index < slots.length ? slots[index] : undefined;
    record[field.key] = slot === undefined ? undefined : field.codec.parse(slot);
  });

  return record as unknown as MapRecord;
}

// The exact inverse of splitMapData: reproduce the current byte layout from a
// named record. Trailing absent slots are trimmed (so an older record yields an
// older-length array); a missing required field — one with a present field after
// it — throws rather than writing a corrupt file.
export function joinMapData(record: MapRecord): string {
  const source = record as unknown as Record<string, unknown>;

  const slots = TOP_LEVEL_FIELDS.map(field => {
    const value = source[field.key];
    return value === undefined ? undefined : field.codec.serialize(value);
  });

  let lastPresent = -1;
  for (let index = 0; index < slots.length; index++) {
    if (slots[index] !== undefined) lastPresent = index;
  }

  for (let index = 0; index <= lastPresent; index++) {
    if (slots[index] === undefined) {
      throw new Error(
        `Cannot serialize .map data: required field "${TOP_LEVEL_FIELDS[index].key}" (position ${index}) is missing while a later field is present.`
      );
    }
  }

  return slots.slice(0, lastPresent + 1).join("\r\n");
}
