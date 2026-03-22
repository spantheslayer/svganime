#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { glob } = require("glob");
const { loadConfig } = require("./lib/config");
const { getPreset } = require("./lib/presets");
const { parseScene } = require("./lib/scene");
const { createFrameComputer, getTotalDuration } = require("./lib/frame");
const { createRenderer } = require("./lib/renderer");
const { createEncoder } = require("./lib/encoder");
const { listEasings } = require("./lib/easings");

const BASE_DIR = __dirname;

async function main() {
  console.log("\n  svganim v2 — SVG → 1080p MP4\n");

  // Load config
  const config = loadConfig(BASE_DIR);

  // Apply preset if set
  if (config.preset) {
    const presetOpts = getPreset(config.preset);
    Object.assign(config, { ...presetOpts, ...stripNulls(config) });
    console.log(`  Preset: ${config.preset}`);
  }

  const inputDir = path.resolve(BASE_DIR, config.inputDir);
  const outputDir = path.resolve(BASE_DIR, config.outputDir);

  // Ensure dirs exist
  if (!fs.existsSync(inputDir)) {
    fs.mkdirSync(inputDir, { recursive: true });
    console.log(`  Created ${config.inputDir}/ — drop your SVGs there and run again.`);
    return;
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Find SVGs
  const files = await glob("*.svg", { cwd: inputDir, absolute: true });
  if (files.length === 0) {
    console.log(`  No SVG files found in ${config.inputDir}/`);
    console.log(`  Drop your SVGs there and run again.\n`);
    return;
  }

  console.log(`  Input:  ${config.inputDir}/  (${files.length} SVG${files.length > 1 ? "s" : ""})`);
  console.log(`  Output: ${config.outputDir}/`);
  console.log(`  Video:  ${config.width}x${config.height} @ ${config.fps}fps`);
  console.log(`  Bg:     ${config.bg}`);
  console.log(`  Stroke: ${config.stroke ? `${config.strokeMode} ${config.strokeDuration}ms ${config.strokeEasing}` : "off"}`);
  console.log(`  Fill:   ${config.fill ? `${config.fillDuration}ms ${config.fillEasing}` : "off"}`);
  console.log(`  Stagger: ${config.stagger}ms  Iterations: ${config.iteration}  Direction: ${config.direction}`);
  console.log("");

  for (const file of files) {
    const name = path.basename(file, ".svg");
    const svgContent = fs.readFileSync(file, "utf-8");

    await processSVG(name, svgContent, outputDir, config);
  }

  console.log("  Done!\n");
}

async function processSVG(name, svgContent, outputDir, config) {
  const scene = parseScene(svgContent);

  if (scene.elements.length === 0) {
    console.log(`  ${name}.svg — no animatable elements, skipped`);
    return;
  }

  // Calculate video duration
  const animDuration = getTotalDuration(scene, config);
  let videoDurationMs;

  if (config.videoDuration) {
    videoDurationMs = config.videoDuration;
  } else if (config.iteration === "infinite" || config.iteration === Infinity) {
    videoDurationMs = 5000; // default 5s for infinite animations
  } else {
    videoDurationMs = animDuration + (config.holdEnd || 0);
  }

  const totalFrames = Math.ceil((videoDurationMs / 1000) * config.fps);
  const frameDurationMs = 1000 / config.fps;

  if (config.verbose) {
    console.log(`  ${name}.svg — ${scene.elements.length} elements, ${scene.svgWidth}x${scene.svgHeight}`);
    for (const el of scene.elements) {
      console.log(`    [${el.tagName}] #${el.id}  len=${el.pathLength.toFixed(1)}  stroke=${el.hasStroke}  fill=${el.hasFill}`);
    }
    console.log(`    Animation: ${animDuration}ms → Video: ${videoDurationMs}ms (${totalFrames} frames)`);
  }

  const outPath = path.join(outputDir, `${name}.mp4`);
  const encoder = createEncoder(outPath, config);

  // Pre-build fast frame computer + renderer (parse once, string replace per frame)
  const getFrame = createFrameComputer(scene, config);
  const render = createRenderer(scene, config);

  const startTime = Date.now();
  process.stdout.write(`  ${name}.svg → ${name}.mp4  `);

  let tCompute = 0, tRender = 0, tEncode = 0;

  for (let i = 0; i < totalFrames; i++) {
    const timeMs = i * frameDurationMs;

    let t0 = Date.now();
    const frameSvg = getFrame(timeMs);
    tCompute += Date.now() - t0;

    t0 = Date.now();
    const { pixels } = render(frameSvg);
    tRender += Date.now() - t0;

    t0 = Date.now();
    await encoder.write(Buffer.from(pixels));
    tEncode += Date.now() - t0;

    if ((i + 1) % 10 === 0 || i === totalFrames - 1) {
      const pct = Math.round(((i + 1) / totalFrames) * 100);
      process.stdout.write(`\r  ${name}.svg → ${name}.mp4  [${pct}%] ${i + 1}/${totalFrames} frames`);
    }
  }

  if (config.verbose) {
    console.log(`\n    Timing: compute=${tCompute}ms  render=${tRender}ms  encode=${tEncode}ms`);
  }

  await encoder.finish();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const fileSize = (fs.statSync(outPath).size / 1024).toFixed(0);
  process.stdout.write(`\r  ${name}.svg → ${name}.mp4  ✓ ${totalFrames} frames, ${fileSize}KB, ${elapsed}s\n`);
}

function stripNulls(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) result[k] = v;
  }
  return result;
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  if (err.message.includes("FFmpeg")) {
    console.error("  Install FFmpeg: brew install ffmpeg\n");
  }
  process.exit(1);
});
