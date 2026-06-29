// Save the whole .map project to storage, machine or cloud
import { lazy } from "@/lazy-loaders";
import { ensureEl, link, parseError, rn } from "@/utils";
import { joinMapData, type MapRecord } from "./map-schema";
import { type SaveOutcome, saveToFileSystem } from "./save-to-file";

type SaveMethod = "storage" | "machine" | "dropbox";

export async function saveMap(method: SaveMethod): Promise<void> {
  if (customization) return tip("Map cannot be saved in EDIT mode, please complete the edit and retry", false, "error");
  closeDialogs("#alert");

  try {
    const mapData = prepareMapData();
    const filename = `${getFileName()}.map`;

    if (method === "storage") await saveToStorage(mapData, true);
    if (method === "machine") await saveToMachine(mapData, filename);
    if (method === "dropbox") await saveToDropbox(mapData, filename);
  } catch (error) {
    ERROR && console.error(error);
    alertMessage.innerHTML = /* html */ `An error occurred while saving the map. If the issue persists, please copy the message below and report it on ${link(
      "https://github.com/Azgaar/Fantasy-Map-Generator/issues",
      "GitHub"
    )}. <p id="errorBox">${parseError(error as Error)}</p>`;

    $("#alert").dialog({
      resizable: false,
      title: "Saving error",
      width: "28em",
      buttons: {
        Retry: function (this: HTMLElement) {
          $(this).dialog("close");
          saveMap(method);
        },
        Close: function (this: HTMLElement) {
          $(this).dialog("close");
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });
  }
}

export function prepareMapData(): string {
  // Serialize a numeric cell array to its comma-joined form. The legacy array
  // layout relied on Array.join's implicit coercion of typed arrays; doing it
  // explicitly per field is clearer and keeps the bytes identical.
  const toCsv = (cells: { join(separator: string): string }): string => cells.join(",");

  const date = new Date();
  const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const license = "File can be loaded in azgaar.github.io/Fantasy-Map-Generator";

  const params: MapRecord["params"] = {
    version: String(VERSION),
    license,
    date: dateString,
    seed: String(seed),
    graphWidth: String(graphWidth),
    graphHeight: String(graphHeight),
    mapId: String(mapId)
  };

  const settings: MapRecord["settings"] = {
    distanceUnit: distanceUnitInput.value,
    distanceScale: String(distanceScale),
    areaUnit: areaUnit.value,
    heightUnit: heightUnit.value,
    heightExponent: heightExponentInput.value,
    temperatureScale: temperatureScale.value,
    reservedBarSize: "", // previously barSize.value
    reservedBarLabel: "", // previously barLabel.value
    reservedBarBackColor1: "", // previously barBackColor.value
    reservedBarBackColor2: "", // previously barBackColor.value
    reservedBarPosX: "", // previously barPosX.value
    reservedBarPosY: "", // previously barPosY.value
    populationRate: String(populationRate),
    urbanization: String(urbanization),
    mapSize: mapSizeOutput.value,
    latitude: latitudeOutput.value,
    reservedTemperatureEquator: "", // previously temperatureEquatorOutput.value
    reservedTemperatureNorth: "", // previously tempNorthOutput.value
    prec: precOutput.value,
    options: JSON.stringify(options),
    mapName: mapName.value,
    hideLabels: String(+hideLabels.checked),
    stylePreset: stylePreset.value,
    rescaleLabels: String(+rescaleLabels.checked),
    urbanDensity: String(urbanDensity),
    longitude: longitudeOutput.value,
    growthRate: ensureEl<HTMLInputElement>("growthRate").value
  };

  const biomes: MapRecord["biomes"] = {
    color: toCsv(biomesData.color),
    habitability: toCsv(biomesData.habitability),
    name: toCsv(biomesData.name)
  };

  // save svg
  const cloneEl = ensureEl("map").cloneNode(true) as SVGSVGElement;

  // reset transform values to default
  cloneEl.setAttribute("width", String(graphWidth));
  cloneEl.setAttribute("height", String(graphHeight));
  cloneEl.querySelector("#viewbox")?.removeAttribute("transform");

  const cloneRuler = cloneEl.querySelector("#ruler");
  if (cloneRuler) cloneRuler.innerHTML = ""; // always remove rulers
  const cloneTradeAnimation = cloneEl.querySelector("#tradeAnimation");
  if (cloneTradeAnimation) cloneTradeAnimation.innerHTML = ""; // always remove transient trade animations

  const serializedSVG = new XMLSerializer().serializeToString(cloneEl);

  const { spacing, cellsX, cellsY, boundary, points, features, cellsDesired } = grid;
  const gridGeneral = JSON.stringify({ spacing, cellsX, cellsY, boundary, points, features, cellsDesired });

  // store custom good icons
  const goodIconsEl = ensureEl("good-icons");
  const customGoodIcons = Array.from(goodIconsEl.querySelectorAll('[id^="good-custom-"]') || [])
    .map(el => el.outerHTML)
    .join("")
    .replace(/[\r\n]+/g, " "); // map data is split by CRLF on load

  // store name array only if not the same as default
  const defaultNB = Names.getNameBases();
  const namesData: MapRecord["namesData"] = nameBases.map((b, i) => {
    const names = defaultNB[i] && defaultNB[i].b === b.b ? "" : b.b;
    return { name: String(b.name), min: String(b.min), max: String(b.max), d: String(b.d), m: String(b.m), names };
  });

  // round population to save space
  const pop = Array.from(pack.cells.pop).map(p => rn(p, 4));

  // Assemble the named record; the schema owns the positional layout. Deprecated
  // top-level slots (pack.cells.road / crossroad) are kept as named reserved "".
  const record: MapRecord = {
    params,
    settings,
    coords: JSON.stringify(mapCoordinates),
    biomes,
    notes: JSON.stringify(notes),
    svg: serializedSVG,
    gridGeneral,
    gridCellsH: toCsv(grid.cells.h),
    gridCellsPrec: toCsv(grid.cells.prec),
    gridCellsF: toCsv(grid.cells.f),
    gridCellsT: toCsv(grid.cells.t),
    gridCellsTemp: toCsv(grid.cells.temp),
    packFeatures: JSON.stringify(pack.features),
    cultures: JSON.stringify(pack.cultures),
    states: JSON.stringify(pack.states),
    burgs: JSON.stringify(pack.burgs),
    cellsBiome: toCsv(pack.cells.biome),
    cellsBurg: toCsv(pack.cells.burg),
    cellsConf: toCsv(pack.cells.conf),
    cellsCulture: toCsv(pack.cells.culture),
    cellsFl: toCsv(pack.cells.fl),
    cellsPop: toCsv(pop),
    cellsR: toCsv(pack.cells.r),
    reservedRoad: "", // deprecated pack.cells.road
    cellsS: toCsv(pack.cells.s),
    cellsState: toCsv(pack.cells.state),
    cellsReligion: toCsv(pack.cells.religion),
    cellsProvince: toCsv(pack.cells.province),
    reservedCrossroad: "", // deprecated pack.cells.crossroad
    religions: JSON.stringify(pack.religions),
    provinces: JSON.stringify(pack.provinces),
    namesData,
    rivers: JSON.stringify(pack.rivers),
    rulers: rulers.toString(),
    fonts: JSON.stringify(getUsedFonts(svg.node()!)),
    markers: JSON.stringify(pack.markers),
    cellRoutes: JSON.stringify(pack.cells.routes),
    routes: JSON.stringify(pack.routes),
    zones: JSON.stringify(pack.zones),
    ice: JSON.stringify(pack.ice),
    cellsGood: toCsv(pack.cells.good),
    goods: JSON.stringify(pack.goods),
    markets: JSON.stringify(pack.markets || []),
    deals: JSON.stringify(pack.deals || []),
    cellsMarket: toCsv(pack.cells.market),
    customGoodIcons
  };

  return joinMapData(record);
}

// save map file to indexedDB
export async function saveToStorage(mapData: string, showTip = false): Promise<void> {
  const blob = new Blob([mapData], { type: "text/plain" });
  await ldb.set("lastMap", blob);
  showTip && tip("Map is saved to the browser storage", false, "success");
}

const DOWNLOADS_FALLBACK_NOTICE_KEY = "savePickerFallbackNoticeShown";

// Whether the one-time fallback explanation has already been shown on this
// browser. Guarded because localStorage can throw (e.g. Safari private mode);
// a save must never fail just because we couldn't read/write this flag.
function fallbackNoticeAlreadyShown(): boolean {
  try {
    return localStorage.getItem(DOWNLOADS_FALLBACK_NOTICE_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberFallbackNoticeShown(): void {
  try {
    localStorage.setItem(DOWNLOADS_FALLBACK_NOTICE_KEY, "true");
  } catch {
    // Storage unavailable — the note may show again next time; harmless.
  }
}

// A single tip per fallback save: the first time also explains why no picker was
// offered. (One tip, not two — a second tip() would overwrite the first, since
// tip() replaces the tooltip's contents.)
function notifyDownloadsFallback(): void {
  if (fallbackNoticeAlreadyShown()) {
    tip('Map is saved to the "Downloads" folder (CTRL + J to open)', true, "success", 8000);
    return;
  }

  tip(
    'Map is saved to the "Downloads" folder (CTRL + J). Your browser can\'t offer a save-location picker — use a Chromium browser (Chrome, Edge) to choose where maps are saved.',
    true,
    "success",
    12000
  );
  rememberFallbackNoticeShown();
}

// Map a save outcome to user feedback. A cancelled picker is a silent no-op.
export function notifySaveOutcome(outcome: SaveOutcome): void {
  if (outcome.type === "cancelled") return;

  if (outcome.type === "downloaded-fallback") {
    notifyDownloadsFallback();
    return;
  }

  // saved — written to the file the user chose in the picker.
  tip(`Map is saved to "${outcome.filename}"`, true, "success", 8000);
}

// Save the .map file to the user's machine via the save-location picker (or the
// Downloads fallback where unsupported), then report the outcome.
async function saveToMachine(mapData: string, filename: string): Promise<void> {
  const outcome = await saveToFileSystem(mapData, filename);
  notifySaveOutcome(outcome);
}

async function saveToDropbox(mapData: string, filename: string): Promise<void> {
  const { Cloud } = await lazy.cloud();
  await Cloud.providers.dropbox.save(filename, mapData);
  tip("Map is saved to your Dropbox", true, "success", 8000);
}
