const PRESETS = {
  draw: {
    stroke: true,
    fill: true,
    strokeMode: "draw",
    strokeDuration: 1000,
    fillDuration: 600,
    fillDelay: 200,
    strokeEasing: "easeInOut",
    fillEasing: "easeInOut",
    stagger: 100,
  },

  "stroke-only": {
    stroke: true,
    fill: false,
    strokeMode: "draw",
    strokeDuration: 1200,
    strokeEasing: "easeInOut",
    stagger: 80,
  },

  "fill-only": {
    stroke: false,
    fill: true,
    fillDuration: 800,
    fillDelay: 0,
    fillEasing: "easeIn",
    stagger: 60,
  },

  "draw-erase": {
    stroke: true,
    fill: false,
    strokeMode: "draw-erase",
    strokeDuration: 2000,
    strokeEasing: "easeInOut",
    iteration: "2",
    stagger: 0,
  },

  dramatic: {
    stroke: true,
    fill: true,
    strokeMode: "draw",
    strokeDuration: 2500,
    fillDuration: 1200,
    fillDelay: 400,
    strokeEasing: "easeInCubic",
    fillEasing: "easeOutCubic",
    stagger: 200,
  },

  fast: {
    stroke: true,
    fill: true,
    strokeMode: "draw",
    strokeDuration: 400,
    fillDuration: 300,
    fillDelay: 50,
    strokeEasing: "easeOut",
    fillEasing: "easeOut",
    stagger: 30,
  },

  erase: {
    stroke: true,
    fill: false,
    strokeMode: "erase",
    strokeDuration: 1000,
    strokeEasing: "easeIn",
    stagger: 80,
  },

  sequential: {
    stroke: true,
    fill: true,
    strokeMode: "draw",
    strokeDuration: 800,
    fillDuration: 400,
    fillDelay: 0,
    strokeEasing: "easeInOut",
    fillEasing: "easeInOut",
    stagger: 900,
  },

  bounce: {
    stroke: true,
    fill: true,
    strokeMode: "draw",
    strokeDuration: 1200,
    fillDuration: 600,
    fillDelay: 200,
    strokeEasing: "easeOutBack",
    fillEasing: "easeOutBack",
    stagger: 100,
  },

  loop: {
    stroke: true,
    fill: false,
    strokeMode: "draw",
    strokeDuration: 1500,
    strokeEasing: "linear",
    iteration: "infinite",
    direction: "alternate",
    stagger: 0,
    videoDuration: 6000,
  },

  elegant: {
    stroke: true,
    fill: true,
    strokeMode: "draw",
    strokeDuration: 1800,
    fillDuration: 1000,
    fillDelay: 300,
    strokeEasing: "easeInOutSine",
    fillEasing: "easeInOutSine",
    stagger: 150,
  },

  snappy: {
    stroke: true,
    fill: true,
    strokeMode: "draw",
    strokeDuration: 300,
    fillDuration: 200,
    fillDelay: 0,
    strokeEasing: "easeOutQuart",
    fillEasing: "easeOutQuart",
    stagger: 50,
  },
};

function getPreset(name) {
  if (!name) return {};
  const preset = PRESETS[name];
  if (!preset) {
    const available = Object.keys(PRESETS).join(", ");
    throw new Error(`Unknown preset "${name}". Available: ${available}`);
  }
  return { ...preset };
}

module.exports = { getPreset, PRESETS };
