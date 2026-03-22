const fs = require("fs");
const path = require("path");

const CONFIG_FILE = "svganim.config.json";

/**
 * Load config from the v2 directory.
 * If no config file exists, create one with defaults.
 */
function loadConfig(baseDir) {
  const configPath = path.join(baseDir, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    const defaults = getDefaults();
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2) + "\n");
    console.log(`Created ${CONFIG_FILE} with defaults — edit it to customize.\n`);
    return defaults;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return { ...getDefaults(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn(`Warning: failed to parse ${configPath}: ${err.message}`);
    return getDefaults();
  }
}

function getDefaults() {
  return {
    // Folders (relative to v2/)
    inputDir: "./input",
    outputDir: "./output",

    // Preset (overrides individual settings below; set to null to use individual settings)
    preset: null,

    // Stroke animation
    stroke: true,
    strokeMode: "draw",        // "draw" | "erase" | "draw-erase"
    strokeDuration: 1000,      // ms
    strokeDelay: 0,            // ms before stroke starts
    strokeEasing: "easeInOut", // any of the 29 easing names

    // Fill animation
    fill: true,
    fillDuration: 600,         // ms
    fillDelay: 200,            // ms after stroke finishes (or after global delay if no stroke)
    fillEasing: "easeInOut",

    // Timing
    stagger: 100,              // ms between each element's animation start
    iteration: 1,              // number of times to repeat (or "infinite")
    direction: "normal",       // "normal" | "reverse" | "alternate" | "alternate-reverse"

    // Video
    fps: 30,
    width: 1920,
    height: 1080,
    bg: "#ffffff",             // background color
    padding: 60,               // px padding around the SVG
    videoDuration: null,       // ms — auto-calculated unless set (required for infinite iteration)

    // Hold: extra time to hold the final frame (ms)
    holdEnd: 500,

    // Verbose logging
    verbose: false,
  };
}

module.exports = { loadConfig, getDefaults };
