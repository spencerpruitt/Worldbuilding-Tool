/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { joinMapData, type MapRecord, splitMapData } from "./map-schema";

// The committed demo world, reused as the round-trip fixture. Read as a raw
// string: the round-trip is a string-level property, so the byte encoding is
// irrelevant as long as read/split/join/compare all use the same string.
const FIXTURE_PATH = fileURLToPath(new URL("../../tests/fixtures/demo.map", import.meta.url));
const rawFixture = readFileSync(FIXTURE_PATH, "utf8");

describe("map-schema codec", () => {
  // The centerpiece: the .map contract holds iff loading then re-saving a real
  // world reproduces the original bytes exactly.
  it("join(split(raw)) === raw — byte-identical for the demo fixture", () => {
    expect(joinMapData(splitMapData(rawFixture))).toBe(rawFixture);
  });

  // Structural symmetry the other direction: a record survives a join then split
  // unchanged, so the named shape is a faithful view of the bytes.
  it("split(join(record)) deep-equals a record parsed from the fixture", () => {
    const record = splitMapData(rawFixture);
    expect(splitMapData(joinMapData(record))).toEqual(record);
  });

  it("preserves deprecated/reserved slots unchanged across a round-trip", () => {
    const record = splitMapData(rawFixture);

    // The two deprecated top-level [] slots (pack.cells.road / crossroad) are
    // kept as named reserved positions, not dropped.
    expect(record.reservedRoad).toBe("");
    expect(record.reservedCrossroad).toBe("");
    // ...and a reserved placeholder inside the settings slot survives too.
    expect(record.settings.reservedBarSize).toBe("");

    const rejoined = splitMapData(joinMapData(record));
    expect(rejoined.reservedRoad).toBe(record.reservedRoad);
    expect(rejoined.reservedCrossroad).toBe(record.reservedCrossroad);
    expect(rejoined.settings.reservedBarSize).toBe(record.settings.reservedBarSize);
  });

  it("throws when a required field is missing, rather than writing a corrupt file", () => {
    const record = splitMapData(rawFixture);
    delete (record as Partial<MapRecord>).svg;

    expect(() => joinMapData(record as MapRecord)).toThrow(/svg/);
  });
});
