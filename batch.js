#!/usr/bin/env node
// batch.js — Standalone batch SVG-to-animated-video converter
// Replaces SVG Artista: analyzes SVGs, generates animation CSS, captures frames, encodes video.
//
// Usage:
//   node batch.js <input-dir> <output-dir> [options]
//
// Options:
//   --fps=60          Frame rate (default: 60)
//   --hold=0.5        Hold initial blank state in seconds (default: 0.5)
//   --anim=3.0        Animation duration in seconds (default: 3.0)
//   --transparent     Output ProRes 4444 .mov with alpha instead of H.264 .mp4
//   --concurrency=3   Process N videos in parallel (default: 3)
//
// Examples:
//   node batch.js ./svgs ./videos
//   node batch.js ./svgs ./videos --fps=30 --anim=5 --transparent

const puppeteer = require("puppeteer");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (const arg of args) {
  if (arg.startsWith("--")) {
    const [key, val] = arg.slice(2).split("=");
    flags[key] = val === undefined ? true : val;
  } else {
    positional.push(arg);
  }
}

const INPUT_DIR = positional[0];
const OUTPUT_DIR = positional[1];
const FPS = parseInt(flags.fps) || 60;
const HOLD_SEC = parseFloat(flags.hold) || 0.5;
const ANIM_SEC = parseFloat(flags.anim) || 3.0;
const TRANSPARENT = !!flags.transparent;
const CONCURRENCY = parseInt(flags.concurrency) || 3;
const WIDTH = 1920;
const HEIGHT = 1080;

if (!INPUT_DIR || !OUTPUT_DIR) {
  console.error("Usage: node batch.js <input-dir> <output-dir> [options]");
  console.error("       node batch.js ./svgs ./videos --fps=30 --transparent");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: Analyze SVG — measure stroke lengths, read fills, add classes
// (This replaces SVG Artista)
// ---------------------------------------------------------------------------
async function analyzeSVG(page, svgContent) {
  const html = `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; }
    body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  </style></head><body>${svgContent}</body></html>`;

  await page.setContent(html, { waitUntil: "load" });

  return await page.evaluate(() => {
    const svg = document.querySelector("svg");
    if (!svg) return { elements: [], svg: "" };

    const shapes = svg.querySelectorAll(
      "path, rect, circle, ellipse, line, polyline, polygon"
    );
    const results = [];
    let idx = 1;

    shapes.forEach((el) => {
      let len;
      try {
        len = el.getTotalLength();
      } catch (e) {
        return;
      }
      if (!len || len === 0) return;

      const computed = getComputedStyle(el);
      const fill = computed.fill;
      const hasFill =
        fill &&
        fill !== "none" &&
        fill !== "transparent" &&
        !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(fill);

      el.classList.add("svg-elem-" + idx);

      results.push({
        index: idx,
        totalLength: len,
        fill: hasFill ? fill : null,
      });
      idx++;
    });

    return { elements: results, svg: svg.outerHTML };
  });
}

// ---------------------------------------------------------------------------
// Step 2: Generate CSS keyframes from element data
// (This is what SVG Artista does — but computed automatically)
// ---------------------------------------------------------------------------
function generateCSS(elements) {
  const STROKE_DELAY_STEP = 0.12; // seconds between each element's stroke anim
  const FILL_DELAY_STEP = 0.1; // seconds between each element's fill anim

  let css = "";

  elements.forEach((el, i) => {
    const n = el.index;
    const len = el.totalLength;
    const strokeDelay = (i * STROKE_DELAY_STEP).toFixed(2);
    const fillDelay = (i * FILL_DELAY_STEP).toFixed(2);

    // Stroke-drawing keyframes
    css += `
@keyframes animate-svg-stroke-${n} {
  0% { stroke-dashoffset: ${len}px; stroke-dasharray: ${len}px; }
  100% { stroke-dashoffset: 0; stroke-dasharray: ${len}px; }
}
`;

    // Fill keyframes (only for elements with a visible fill)
    if (el.fill) {
      css += `
@keyframes animate-svg-fill-${n} {
  0% { fill: transparent; }
  100% { fill: ${el.fill}; }
}
`;
    }

    // Animation rule
    let anim = `animate-svg-stroke-${n} 1s ease-in-out ${strokeDelay}s both`;
    if (el.fill) {
      anim += `, animate-svg-fill-${n} 0.7s linear ${fillDelay}s both`;
    }

    css += `.svg-elem-${n} { animation: ${anim}; }\n`;
  });

  return css;
}

// ---------------------------------------------------------------------------
// Step 3: Text animation setup (runs inside Puppeteer page.evaluate)
// Stroke-drawing effect for <text> elements, matching shape animation timing.
// ---------------------------------------------------------------------------
function getTextAnimCode() {
  return function triggerAllAnimations() {
    var svg = document.querySelector("svg");
    if (!svg) return;

    // Collect animation delays for each svg-elem-N from stylesheets
    var animDelays = {};
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var rules = document.styleSheets[s].cssRules;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (!rule.selectorText) continue;
          var m = rule.selectorText.match(/\.svg-elem-(\d+)$/);
          if (!m) continue;
          // Check both transition-delay and animation-delay
          var delays =
            rule.style.transitionDelay || rule.style.animationDelay;
          if (delays) {
            var first = parseFloat(delays.split(",")[0]);
            if (!isNaN(first)) animDelays[parseInt(m[1])] = first * 1000;
          }
        }
      }
    } catch (e) {}

    // Trigger CSS transitions (no-op for @keyframes, but harmless)
    svg.classList.add("active");
    getComputedStyle(svg).fill;

    function getDelayFromEl(el) {
      var c = (el.className && el.className.baseVal) || "";
      var m = c.match(/svg-elem-(\d+)/);
      if (m && animDelays[parseInt(m[1])] !== undefined)
        return animDelays[parseInt(m[1])];
      return null;
    }

    var easing = "cubic-bezier(0.68, -0.55, 0.265, 1.55)";
    var texts = svg.querySelectorAll("text");
    var count = 0;

    texts.forEach(function (text) {
      var cls = (text.className && text.className.baseVal) || "";
      if (cls.indexOf("svg-elem-") !== -1) return;

      var delay = count * 100;
      var parent = text.parentElement;

      var sib = parent && parent.querySelector('[class*="svg-elem-"]');
      if (sib) {
        var d = getDelayFromEl(sib);
        if (d !== null) delay = d;
      } else {
        var el = text.previousElementSibling;
        while (el) {
          var d = getDelayFromEl(el);
          if (d !== null) {
            delay = d;
            break;
          }
          var inner =
            el.querySelector && el.querySelector('[class*="svg-elem-"]');
          if (inner) {
            d = getDelayFromEl(inner);
            if (d !== null) {
              delay = d;
              break;
            }
          }
          el = el.previousElementSibling;
        }
      }

      var fillColor = getComputedStyle(text).fill || "rgb(255,255,255)";
      var len = text.getComputedTextLength() * 3;

      text.setAttribute("stroke", fillColor);
      text.setAttribute("stroke-width", "0.5");
      text.setAttribute("stroke-dasharray", len);

      text.animate(
        [{ strokeDashoffset: len + "px" }, { strokeDashoffset: "0px" }],
        { duration: 1000, delay: delay, easing: easing, fill: "both" }
      );
      text.animate([{ fill: "transparent" }, { fill: fillColor }], {
        duration: 700,
        delay: delay + 800,
        easing: easing,
        fill: "both",
      });

      count++;
    });

    // Pause ALL animations at time 0
    document
      .getAnimations()
      .forEach(function (a) {
        a.pause();
        a.currentTime = 0;
      });
  };
}

// ---------------------------------------------------------------------------
// Step 4: Capture frames and encode video for a single SVG
// ---------------------------------------------------------------------------
async function processOne(browser, svgFile, outputFile, tmpDir) {
  const svgContent = fs.readFileSync(svgFile, "utf-8");
  const framesDir = path.join(tmpDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  try {
    // --- Analyze SVG & generate CSS ---
    const { elements, svg: modifiedSVG } = await analyzeSVG(page, svgContent);

    if (elements.length === 0) {
      console.log(`  [skip] No animatable elements in ${path.basename(svgFile)}`);
      return false;
    }

    const css = generateCSS(elements);

    // --- Build the capture page ---
    const bg = TRANSPARENT ? "transparent" : "rgb(28, 28, 26)";
    const captureHTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body {
    background: ${bg};
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg { width: 100%; height: 100%; }
  ${css}
</style>
</head>
<body>${modifiedSVG}</body>
</html>`;

    const htmlPath = path.resolve(path.join(tmpDir, "page.html"));
    fs.writeFileSync(htmlPath, captureHTML);
    await page.goto(`file://${htmlPath}`, { waitUntil: "load" });

    // --- Set up animations (shapes + text), paused at t=0 ---
    await page.evaluate(getTextAnimCode());

    // --- Capture frames ---
    const totalFrames = Math.ceil(FPS * (HOLD_SEC + ANIM_SEC));
    const holdFrames = Math.ceil(FPS * HOLD_SEC);
    const screenshotOpts = { type: "png", omitBackground: TRANSPARENT };

    // Hold frames (t=0, everything invisible)
    const firstFrame = path.join(framesDir, "frame_00000.png");
    await page.screenshot({ path: firstFrame, ...screenshotOpts });
    for (let i = 1; i < holdFrames; i++) {
      fs.copyFileSync(
        firstFrame,
        path.join(framesDir, `frame_${String(i).padStart(5, "0")}.png`)
      );
    }

    // Animation frames
    const frameDurationMs = 1000 / FPS;
    const animFrames = totalFrames - holdFrames;

    for (let i = 0; i < animFrames; i++) {
      const timeMs = i * frameDurationMs;
      await page.evaluate((t) => {
        document.getAnimations().forEach((a) => {
          a.currentTime = t;
        });
      }, timeMs);

      const frameIndex = holdFrames + i;
      await page.screenshot({
        path: path.join(
          framesDir,
          `frame_${String(frameIndex).padStart(5, "0")}.png`
        ),
        ...screenshotOpts,
      });
    }

    // --- Encode video ---
    const ffmpegEncode = TRANSPARENT
      ? `-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le`
      : `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow`;

    execSync(
      `ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%05d.png" ${ffmpegEncode} "${outputFile}"`,
      { stdio: "pipe" }
    );

    return true;
  } finally {
    await page.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Main: process all SVGs with concurrency
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const svgFiles = fs
    .readdirSync(INPUT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".svg"))
    .map((f) => path.join(INPUT_DIR, f))
    .sort();

  if (svgFiles.length === 0) {
    console.error(`No .svg files found in ${INPUT_DIR}`);
    process.exit(1);
  }

  const ext = TRANSPARENT ? "mov" : "mp4";
  console.log(`Found ${svgFiles.length} SVG files`);
  console.log(
    `Settings: ${WIDTH}x${HEIGHT} @ ${FPS}fps, hold=${HOLD_SEC}s, anim=${ANIM_SEC}s, format=${ext}`
  );
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });

  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  // Process in batches of CONCURRENCY
  for (let i = 0; i < svgFiles.length; i += CONCURRENCY) {
    const batch = svgFiles.slice(i, i + CONCURRENCY);

    const promises = batch.map(async (svgFile) => {
      const baseName = path.basename(svgFile, ".svg");
      const outputFile = path.join(OUTPUT_DIR, `${baseName}.${ext}`);
      const tmpDir = path.join(OUTPUT_DIR, `.tmp_${baseName}_${Date.now()}`);

      try {
        const ok = await processOne(browser, svgFile, outputFile, tmpDir);
        completed++;
        if (ok) {
          console.log(
            `  [${completed + failed}/${svgFiles.length}] ${baseName}.${ext}`
          );
        }
      } catch (err) {
        failed++;
        console.error(
          `  [${completed + failed}/${svgFiles.length}] FAILED ${baseName}: ${err.message}`
        );
        // Clean up on error
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    await Promise.all(promises);
  }

  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nDone! ${completed} videos generated, ${failed} failed. (${elapsed}s)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
