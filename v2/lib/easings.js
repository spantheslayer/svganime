/**
 * All 29 easing functions.
 * Each takes a progress value t in [0,1] and returns the eased value.
 * Values may exceed [0,1] for bounce/back easings — this is expected.
 */

const PI = Math.PI;
const c1 = 1.70158;
const c3 = c1 + 1;

const EASINGS = {
  // --- CSS built-in equivalents ---
  linear: (t) => t,
  ease: (t) => cubicBezier(0.25, 0.1, 0.25, 1.0, t),
  easeIn: (t) => cubicBezier(0.42, 0, 1, 1, t),
  easeOut: (t) => cubicBezier(0, 0, 0.58, 1, t),
  easeInOut: (t) => cubicBezier(0.42, 0, 0.58, 1, t),

  // --- Quad ---
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  // --- Cubic ---
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => --t * t * t + 1,
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

  // --- Quart ---
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - --t * t * t * t,
  easeInOutQuart: (t) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,

  // --- Quint ---
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 + --t * t * t * t * t,
  easeInOutQuint: (t) =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t,

  // --- Sine ---
  easeInSine: (t) => 1 - Math.cos((t * PI) / 2),
  easeOutSine: (t) => Math.sin((t * PI) / 2),
  easeInOutSine: (t) => -(Math.cos(PI * t) - 1) / 2,

  // --- Expo ---
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // --- Circ ---
  easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t) => Math.sqrt(1 - --t * t),
  easeInOutCirc: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
      : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2,

  // --- Back (overshoot) ---
  easeInBack: (t) => c3 * t * t * t - c1 * t * t,
  easeOutBack: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  easeInOutBack: (t) => {
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
};

/**
 * Attempt to sample a cubic-bezier curve at parameter t.
 * Uses Newton-Raphson iteration for accuracy.
 */
function cubicBezier(x1, y1, x2, y2, t) {
  // For linear or degenerate curves
  if (x1 === y1 && x2 === y2) return t;

  function sampleCurveX(tt) {
    return ((1 - 3 * x2 + 3 * x1) * tt + (3 * x2 - 6 * x1)) * tt + 3 * x1 * tt;
  }
  function sampleCurveY(tt) {
    return ((1 - 3 * y2 + 3 * y1) * tt + (3 * y2 - 6 * y1)) * tt + 3 * y1 * tt;
  }
  function sampleDerivX(tt) {
    return (3 * (1 - 3 * x2 + 3 * x1)) * tt * tt + (2 * (3 * x2 - 6 * x1)) * tt + 3 * x1;
  }

  // Newton-Raphson to solve for parameter u where sampleCurveX(u) = t
  let u = t;
  for (let i = 0; i < 8; i++) {
    const xErr = sampleCurveX(u) - t;
    if (Math.abs(xErr) < 1e-7) break;
    const dx = sampleDerivX(u);
    if (Math.abs(dx) < 1e-7) break;
    u -= xErr / dx;
  }
  u = Math.max(0, Math.min(1, u));

  return sampleCurveY(u);
}

function getEasing(name) {
  const fn = EASINGS[name];
  if (!fn) {
    const available = Object.keys(EASINGS).join(", ");
    throw new Error(`Unknown easing "${name}". Available:\n  ${available}`);
  }
  return fn;
}

function listEasings() {
  return Object.keys(EASINGS);
}

module.exports = { EASINGS, getEasing, listEasings };
