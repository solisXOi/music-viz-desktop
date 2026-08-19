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

export function isBannedPreset(name) {
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
