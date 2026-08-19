const STORAGE_KEY = "music-viz-hidden-presets";

/** Names that typically look like cells, goo, or organisms in water. */
const BANNED_SUBSTRINGS = [
  "organic",
  "mindblob",
  "alien fish",
  "predator-prey",
  "reaction diffusion",
  "bombyx",
  "mucus",
  "oozing",
  "moss posy",
  "cell tissue",
  "virus broth",
  "glassworm",
];

/** Exact preset keys removed after review. */
const REMOVED_PRESETS = new Set([
  "martin - ghost city",
  "Unchained - Rewop",
  "_Geiss - Desert Rose 2",
  "martin - frosty caves 2",
  "martin - extreme heat",
  "Aderrasi + Geiss - Airhandler (Kali Mix) - Canvas Mix",
  "martin - chain breaker",
  "Idiot - Star Of Annon",
  "Geiss - Spiral Artifact",
  "flexi - what is the matrix",
  "flexi - patternton, district of media, capitol of the united abstractions of fractopia",
  "Geiss + Flexi + Martin - disconnected",
  "_Geiss - untitled",
]);

/** 1 = normal. Lower values calm a preset without removing it. */
const PRESET_ACTIVITY = {};

export function getPresetActivity(name) {
  return PRESET_ACTIVITY[name] ?? 1;
}

export function isBannedPreset(name) {
  if (REMOVED_PRESETS.has(name)) return true;
  const lower = String(name).toLowerCase();
  return BANNED_SUBSTRINGS.some((token) => lower.includes(token));
}

export function loadHiddenPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function hidePreset(name) {
  const hidden = loadHiddenPresets();
  hidden.add(name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  return hidden;
}

export function filterPresetKeys(allKeys) {
  const hidden = loadHiddenPresets();
  const filtered = allKeys.filter((key) => !isBannedPreset(key) && !hidden.has(key));
  if (filtered.length > 0) return filtered;

  const organicFree = allKeys.filter((key) => !isBannedPreset(key));
  return organicFree.length > 0 ? organicFree : allKeys;
}

export function shortPresetName(name) {
  if (!name) return "";
  return name.replace(/^[_$]+\s*/, "").trim();
}
