/**
 * Custom (non-Milkdrop) scenes.
 *
 * Contract for a scene engine:
 *   constructor(canvas)
 *   init()
 *   setVisible(visible)
 *   update(dt, dynamics)
 *   draw()
 *   resize()
 *   destroy()
 *   accentPunch(intensity)
 *   triggerDrop()
 *
 * Add a new look by writing an engine that matches that surface,
 * then appending it here. VisualEngine already switches by key.
 */
import { FieldsEngine, FIELDS_PRESET_KEY } from "../fields.js";

export { FieldsEngine, FIELDS_PRESET_KEY };

export const CUSTOM_SCENES = [
  {
    key: FIELDS_PRESET_KEY,
    id: "oblivion",
    Engine: FieldsEngine,
    startFirst: true,
  },
];

export function isCustomKey(key) {
  return CUSTOM_SCENES.some((scene) => scene.key === key);
}

export function createCustomScene(key, canvas) {
  const scene = CUSTOM_SCENES.find((entry) => entry.key === key);
  if (!scene) return null;
  return new scene.Engine(canvas);
}
