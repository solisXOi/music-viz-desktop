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

const CALM_PRESETS = new Set([
  "_Aderrasi - Wanderer in Curved Space - mash0000 - faclempt kibitzing meshuggana schmaltz (Geiss color mix)",
  "An AdamFX n Martin Infusion 2 flexi - Why The Sky Looks Diffrent Today - AdamFx n Martin Infusion - Tack Tile Disfunction B",
  "cope + martin - mother-of-pearl",
  "Eo.S. + Zylot - skylight (Stained Glass Majesty mix)",
  "Flexi + Martin - cascading decay swing",
  "flexi - swing out on the spiral",
  "Flexi, martin + geiss - dedicated to the sherwin maxawow",
  "Fumbling_Foo & Flexi, Martin, Orb, Unchained - Star Nova v7b",
  "martin - angel flight",
  "martin - castle in the air",
  "martin - glass corridor",
  "martin - infinity (2010 update)",
  "Martin - liquid arrows",
  "martin - reflections on black tiles",
  "martin - stormy sea (2010 update)",
  "shifter - dark tides bdrv mix 2",
  "TonyMilkdrop - Leonardo Da Vinci's Balloon [Flexi - merry-go-round + techstyle]",
  "TonyMilkdrop - Magellan's Nebula [Flexi - you enter first + multiverse]",
  "Unchained & Rovastar - Wormhole Pillars (Hall of Shadows mix)",
  "Zylot - Star Ornament",
  "Zylot - True Visionary (Final Mix)",
]);

const PEAK_PRESETS = new Set([
  "$$$ Royal - Mashup (197)",
  "$$$ Royal - Mashup (220)",
  "$$$ Royal - Mashup (431)",
  "_Geiss - Artifact 01",
  "_Rovastar + Geiss - Hurricane Nightmare (Posterize Mix)",
  "Aderrasi - Storm of the Eye (Thunder) - mash0000 - quasi pseudo meta concentrics",
  "Cope - The Neverending Explosion of Red Liquid Fire",
  "Eo.S. - glowsticks v2 05 and proton lights (+Krash′s beat code) _Phat_remix02b",
  "fiShbRaiN + Flexi - witchcraft 2.0",
  "flexi + geiss - pogo cubes vs. tokamak vs. game of life [stahls jelly 4.5 finish]",
  "Flexi + Martin - astral projection",
  "Flexi + stahlregen - jelly showoff parade",
  "Flexi - area 51",
  "Flexi - infused with the spiral",
  "flexi - mom, why the sky looks different today",
  "Flexi - smashing fractals [acid etching mix]",
  "Flexi - truly soft piece of software - this is generic texturing (Jelly) ",
  "Flexi, fishbrain, Geiss + Martin - tokamak witchery",
  "Geiss - Thumb Drum",
  "Geiss, Flexi + Stahlregen - Thumbdrum Tokamak [crossfiring aftermath jelly mashup]",
  "Krash + Illusion - Spiral Movement",
  "martin + flexi - diamond cutter [prismaticvortex.com] - camille - i wish i wish i wish i was constrained",
  "Martin - acid wiring",
  "martin - another kind of groove",
  "martin - disco mix 4",
  "martin - witchcraft reloaded",
  "martin, flexi, fishbrain + sto - enterstate [random mashup]",
  "sawtooth grin roam",
]);

/** 1 = normal. Lower values calm a preset without removing it. */
const PRESET_ACTIVITY = {};

export function getPresetActivity(name) {
  return PRESET_ACTIVITY[name] ?? 1;
}

export function moodForPreset(name) {
  if (CALM_PRESETS.has(name)) return "calm";
  if (PEAK_PRESETS.has(name)) return "peak";
  return "groove";
}

export function keysForMood(allKeys, mood) {
  const calm = allKeys.filter((key) => moodForPreset(key) === "calm");
  const peak = allKeys.filter((key) => moodForPreset(key) === "peak");
  const groove = allKeys.filter((key) => moodForPreset(key) === "groove");

  if (mood === "calm") return calm.length ? calm : groove.length ? groove : allKeys;
  if (mood === "peak") return peak.length ? peak : groove.length ? groove : allKeys;
  if (groove.length && peak.length) return [...groove, ...groove, ...peak];
  return groove.length ? groove : allKeys;
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
