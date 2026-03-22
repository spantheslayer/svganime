const PI = Math.PI;
const c1 = 1.70158;
const c3 = c1 + 1;

const EASINGS = {
  linear: (t) => t,
  ease: (t) => cubicBezier(0.25, 0.1, 0.25, 1.0, t),
  easeIn: (t) => cubicBezier(0.42, 0, 1, 1, t),
  easeOut: (t) => cubicBezier(0, 0, 0.58, 1, t),
  easeInOut: (t) => cubicBezier(0.42, 0, 0.58, 1, t),
  easeInQuad: (t) => t * t,
  easeInCubic: (t) => t * t * t,
  easeInQuart: (t) => t * t * t * t,
  easeInQuint: (t) => t * t * t * t * t,
  easeInSine: (t) => 1 - Math.cos((t * PI) / 2),
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
  easeInBack: (t) => c3 * t * t * t - c1 * t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeOutCubic: (t) => --t * t * t + 1,
  easeOutQuart: (t) => 1 - --t * t * t * t,
  easeOutQuint: (t) => 1 + --t * t * t * t * t,
  easeOutSine: (t) => Math.sin((t * PI) / 2),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeOutCirc: (t) => Math.sqrt(1 - --t * t),
  easeOutBack: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInOutQuart: (t) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  easeInOutQuint: (t) =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t,
  easeInOutSine: (t) => -(Math.cos(PI * t) - 1) / 2,
  easeInOutExpo: (t) => {
    if (t === 0 || t === 1) {
      return t;
    }

    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeInOutCirc: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
      : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2,
  easeInOutBack: (t) => {
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
};

function cubicBezier(x1, y1, x2, y2, t) {
  if (x1 === y1 && x2 === y2) {
    return t;
  }

  function sampleCurveX(tt) {
    return ((1 - 3 * x2 + 3 * x1) * tt + (3 * x2 - 6 * x1)) * tt + 3 * x1 * tt;
  }

  function sampleCurveY(tt) {
    return ((1 - 3 * y2 + 3 * y1) * tt + (3 * y2 - 6 * y1)) * tt + 3 * y1 * tt;
  }

  function sampleDerivX(tt) {
    return (
      3 * (1 - 3 * x2 + 3 * x1) * tt * tt +
      2 * (3 * x2 - 6 * x1) * tt +
      3 * x1
    );
  }

  let u = t;
  for (let i = 0; i < 8; i += 1) {
    const xError = sampleCurveX(u) - t;
    if (Math.abs(xError) < 1e-7) {
      break;
    }

    const derivative = sampleDerivX(u);
    if (Math.abs(derivative) < 1e-7) {
      break;
    }

    u -= xError / derivative;
  }

  u = Math.max(0, Math.min(1, u));
  return sampleCurveY(u);
}

function getEasing(name) {
  const easing = EASINGS[name];
  if (!easing) {
    throw new Error(`Unknown easing "${name}".`);
  }
  return easing;
}

function listEasings() {
  return Object.keys(EASINGS);
}

module.exports = { EASINGS, getEasing, listEasings };
