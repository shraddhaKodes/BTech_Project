import fs from 'node:fs';

/** Loads data/sectors.json and builds lookups. Each sector is covered by exactly one PMU. */
export function loadSectors(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const busSector = new Map();
  for (const s of j.sectors) for (const id of s.buses) busSector.set(id, s.id);
  const pmus = new Map(j.sectors.map((s) => [s.pmu.id, { ...s.pmu, sector: s.id, name: s.name, color: s.color, buses: s.buses.length }]));
  return { raw: j, sectors: j.sectors, busSector, pmus, tieEdge: j.tieEdge };
}
