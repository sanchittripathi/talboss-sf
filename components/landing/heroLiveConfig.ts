/**
 * Every constant of the hero motion (HeroLive.tsx), in one place. Documented in docs/team/FRONTEND.md
 * ("Hero motion: the fog is thinking"). Direction: docs/team/HERO_DIRECTION.md §3.
 *
 * Units. Image space `uv` is the still in fractions of its width and height (0..1, y down), the same space the art
 * lane's paths.json uses. Shader space `p` is uv with y scaled by height/width, so both axes are in fractions of the
 * image WIDTH (distances are round on screen). At 1440 the 16:9 still is drawn 1440 px wide, so 1 unit = 1440 CSS px.
 */

// Copy of docs/team/art/round6/paths.json; kept beside the code because `docs` is not uploaded to Railway.
import round6Paths from "./heroPaths.json";

export type Crop = "16x9" | "4x5";
export type Path = [number, number][];

/** Time. One 30 s loop: three pulse slots of 10 s, path 0, 1, 2. Second 30 equals second 0. */
export const LOOP_S = 30;
export const SLOT_S = 10;
/** A pulse travels its path in 4.5 s (ease-in-out), then the grass around the figure breathes for 1.4 s. */
export const PULSE_TRAVEL_S = 4.5;
export const BREATH_S = 1.4;
/** The breath starts this long before the pulse arrives (so it peaks 0.3 s after arrival, at 3.3 s for the first),
 *  and the pulse fades in over the first PULSE_IN and out over the last PULSE_OUT of its travel: the light hands over
 *  to the breath instead of popping. */
export const BREATH_LEAD_S = 0.4;
export const PULSE_IN = 0.1;
export const PULSE_OUT = 0.1;
/** Seconds after first paint (performance 'first-paint') at which the first pulse reaches the figure. */
export const FIRST_ARRIVAL_S = 3.0;
/** Render and grain cadence: film, 24 fps; frames between are held (no draw). */
export const FPS = 24;
/** Canvas opacity fade once the first frame is on screen (the still under it is identical, so it reads as "comes alive"). */
export const FADE_MS = 700;

/** Fog drift. The noise pattern travels downhill at DRIFT_PX_S CSS px/s at every width (the period is set from the
 *  drawn image width), so one loop moves it DRIFT_PX_S × 30 = 180 px, the noise period along the drift axis (seamless). */
export const DRIFT_PX_S = 6;
/** Downhill in the image: down into the city, leaning left with the fog sheet (it pours from the upper right).
 *  Normalised in the shader. */
export const DRIFT_DIR: [number, number] = [-0.35, 1];
/** UV displacement inside the fog mask: max 0.35 % of the image width (≈ 5 px at 1440). */
export const DISP_MAX = 0.0035;
/** Fog density breathing: luminance × (1 ± DENSITY) inside the mask, travelling with the noise. */
export const DENSITY = 0.07;
/** Noise cells per loop period along the drift axis (integers keep the loop seamless) and cell size across it. */
export const NOISE_CELLS = [2, 5] as const;
export const NOISE_ACROSS = 0.09;
/** The noise lives in a NOISE_TEX² tileable texture (built once on the CPU; cheaper than hashing per pixel). Across
 *  the drift it repeats every NOISE_ACROSS_CELLS cells = 8 × 0.09 = 0.72 of the width, too far apart to read. */
export const NOISE_TEX = 128;
export const NOISE_ACROSS_CELLS = 8;

/** Fog mask: smoothstep(lumLo, lumHi, luminance) × a vertical band [top, bottom] in image fractions, feathered. */
export type FogMask = { lumLo: number; lumHi: number; top: number; bottom: number; feather: number };
/** The mask is built once per source on the CPU at MASK_W px wide and box-blurred twice (radius MASK_BLUR px), so it
 *  is smooth: a mask keyed on full-res detail makes the warp tear edges. */
export const MASK_W = 256;
export const MASK_BLUR = 3;
export const FOG: Record<Crop, FogMask> = {
  // Round 6 (fog-e1). The drift moves the fog BODY, not the filaments: the band ends at the body's lower edge
  // (16:9 y 0.42, 4:5 y 0.50) and fades out over 0.06, so the filaments that hang below it (16:9 x 0.42–0.72,
  // y 0.42–0.55) and the lit city stay still. The key starts above the blurred city (≈ 0.4) and is full at 0.78.
  "16x9": { lumLo: 0.4, lumHi: 0.78, top: 0.27, bottom: 0.42, feather: 0.06 },
  "4x5": { lumLo: 0.4, lumHi: 0.78, top: 0.33, bottom: 0.5, feather: 0.06 },
};

/** The person and the bench, a box in image fractions: the fog mask is zero inside it and feathered over FIGURE_FEATHER
 *  (fraction of the width) around it, so the warp can never touch them. Round 6b (fog-f1, the coder on a bench). */
export const FIGURE: Record<Crop, { x0: number; x1: number; y0: number; y1: number }> = {
  "16x9": { x0: 0.152, x1: 0.267, y0: 0.585, y1: 0.7 },
  "4x5": { x0: 0.136, x1: 0.362, y0: 0.598, y1: 0.7 },
};
export const FIGURE_FEATHER = 0.025;

/** Pulse: a soft gaussian lift travelling along the path. σ along = PULSE_LEN × path length, σ across in p units.
 *  Light added = lift × (PULSE_REL × luminance + PULSE_ABS): +18 % on the fog, a faint glow on dark ground. */
/*  Steve r4: at +18 % the light was invisible on the real pixels (a +18 % lift on an already lit city reads as nothing
    at 1:1; five frames across 0–3.4 s were indistinguishable). Raised so the light is seen on the first look, still
    soft, still under CAP, never a flash. */
export const PULSE_LEN = 0.05;
export const PULSE_ACROSS = 0.034;
export const PULSE_REL = 0.32;
export const PULSE_ABS = 0.045;
/** Breath: radial lift around the path's end, σ in p units, light = env × (BREATH_REL × lum + BREATH_ABS).
 *  Steve r4: the arrival is the payoff, so the person is visibly touched by the light (was 0.06 / 0.02, ≈ +9/255). */
export const BREATH_SIGMA = 0.045;
export const BREATH_REL = 0.14;
export const BREATH_ABS = 0.05;
/** Nothing the shader adds may lift a pixel above 230/255 (the white pill stays the brightest thing on the page). */
export const CAP = 230 / 255;
/** Bloom on plate values above 200/255: baked into the mask texture's alpha (blur radius BLOOM_BLUR mask px, twice),
 *  added as BLOOM × (excess over 200/255). Static, gentle; clamped by CAP like everything else. */
export const BLOOM_FROM = 200 / 255;
export const BLOOM_BLUR = 4;
export const BLOOM = 0.5;
/** Film grain: luminance only, 1 device px, ± GRAIN, new every 1/24 s. */
export const GRAIN = 0.035;
export const DPR_MAX = 2;

/** Three hand-set paths per crop, far fog → the coder's laptop, in image fractions: the art lane's
 *  docs/team/art/round6/paths.json (6b), read at build time (a new paths.json needs a rebuild). Every path ends at the
 *  laptop (16:9 [0.232, 0.645], 4:5 [0.290, 0.650]), where the breath lands. Round 6b: the founder wants the figure,
 *  so the light runs to the person again (Steve's centre-crest paths are kept below as CENTRE_PATHS, unused). */
export const PATHS = round6Paths as unknown as Record<Crop, Path[]>;

/** Steve r4 (unused since 6b): the light landing on the crest at the centre, above the sub, when the figure was cut.
 *  Same plate geometry as fog-e1. Image fractions, both crops. */
export const CENTRE_PATHS: Record<Crop, Path[]> = {
  "16x9": [
    [[0.9, 0.36], [0.78, 0.4], [0.68, 0.45], [0.6, 0.51], [0.55, 0.57], [0.52, 0.63], [0.5, 0.675]],
    [[0.72, 0.42], [0.65, 0.47], [0.59, 0.52], [0.54, 0.575], [0.51, 0.625], [0.5, 0.675]],
    [[0.86, 0.46], [0.76, 0.52], [0.66, 0.58], [0.57, 0.63], [0.5, 0.675]],
  ],
  "4x5": [
    [[0.95, 0.41], [0.85, 0.46], [0.74, 0.52], [0.64, 0.58], [0.56, 0.63], [0.5, 0.68]],
    [[0.8, 0.52], [0.7, 0.57], [0.6, 0.62], [0.53, 0.655], [0.5, 0.68]],
    [[0.62, 0.47], [0.58, 0.53], [0.54, 0.59], [0.52, 0.64], [0.5, 0.68]],
  ],
};
