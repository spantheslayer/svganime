#!/usr/bin/env node

const { program } = require("commander");
const { glob } = require("glob");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { renderSvgToMp4, listEasings } = require("./lib/animator");

function parseNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number. Received: ${value}`);
  }
  return parsed;
}

async function resolveSvgFiles(input) {
  const resolved = path.resolve(input);

  if (fs.existsSync(resolved)) {
    const stats = fs.statSync(resolved);
    if (stats.isDirectory()) {
      return glob(path.join(resolved, "**/*.svg"), { nodir: true });
    }
    if (stats.isFile() && resolved.toLowerCase().endsWith(".svg")) {
      return [resolved];
    }
  }

  return glob(input, { nodir: true });
}

function normalizeOptions(opts) {
  const easingNames = new Set(listEasings());
  const strokeEasing = opts.strokeEasing;
  const fillEasing = opts.fillEasing;

  if (!easingNames.has(strokeEasing)) {
    throw new Error(`Unknown stroke easing "${strokeEasing}".`);
  }
  if (!easingNames.has(fillEasing)) {
    throw new Error(`Unknown fill easing "${fillEasing}".`);
  }

  if (!["transition", "animation"].includes(opts.animationType)) {
    throw new Error(`animation-type must be "transition" or "animation".`);
  }

  if (!["normal", "reverse"].includes(opts.strokeDirection)) {
    throw new Error(`stroke-direction must be "normal" or "reverse".`);
  }

  return {
    width: parseNumber(opts.width, "width"),
    height: parseNumber(opts.height, "height"),
    fps: parseNumber(opts.fps, "fps"),
    backgroundColor: opts.backgroundColor,
    elementClass: opts.elementClass,
    animationType: opts.animationType,
    animateStroke: opts.stroke,
    animateFill: opts.fill,
    strokeDuration: parseNumber(opts.strokeDuration, "stroke-duration"),
    strokeStagger: parseNumber(opts.strokeStagger, "stroke-stagger"),
    strokeDelay: parseNumber(opts.strokeDelay, "stroke-delay"),
    strokeEasing,
    strokeDirection: opts.strokeDirection,
    fillDuration: parseNumber(opts.fillDuration, "fill-duration"),
    fillStagger: parseNumber(opts.fillStagger, "fill-stagger"),
    fillDelay: parseNumber(opts.fillDelay, "fill-delay"),
    fillEasing,
    holdDuration: parseNumber(opts.holdDuration, "hold-duration"),
    keepFrames: Boolean(opts.keepFrames),
    progress: opts.progress,
    verbose: Boolean(opts.verbose),
  };
}

function createProgressReporter(label) {
  const interactive = Boolean(process.stdout.isTTY);
  let lastBucket = -1;
  let lastLine = "";

  function writeLine(line, force = false) {
    if (!force && line === lastLine) {
      return;
    }

    lastLine = line;

    if (interactive) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(line);
      return;
    }

    console.log(line);
  }

  return (event) => {
    if (event.stage === "prepare") {
      writeLine(
        `  preparing ${event.elementCount} element(s), ${event.frameCount} frame(s), ${event.totalDurationMs}ms total`,
        true
      );
      return;
    }

    if (event.stage === "render") {
      const percent = Math.max(0, Math.min(100, Math.floor(event.percent * 100)));
      const bucket = interactive ? percent : Math.floor(percent / 10) * 10;
      if (bucket === lastBucket && !event.done) {
        return;
      }
      lastBucket = bucket;
      writeLine(
        `  rendering frames ${event.frameIndex}/${event.frameCount} (${percent}%)`
      );
      return;
    }

    if (event.stage === "encode") {
      writeLine("  finalizing mp4 container...", true);
      return;
    }

    if (event.stage === "done") {
      writeLine(`  completed in ${event.elapsedMs}ms`, true);
      if (interactive) {
        process.stdout.write("\n");
      }
    }
  };
}

program
  .name("svganim")
  .description("Batch convert SVG files into animated 1080p MP4 videos")
  .argument("[input]", "SVG file, folder, or glob pattern", "./input")
  .option("-o, --output <dir>", "Output directory", "./output")
  .option("--width <px>", "Output width", "1920")
  .option("--height <px>", "Output height", "1080")
  .option("--fps <n>", "Frames per second", "30")
  .option("--background-color <color>", "Video background color", "#ffffff")
  .option("--element-class <name>", "Base class applied to animated elements", "svg-elem")
  .option(
    "--animation-type <type>",
    "SVG Artista mode (transition|animation)",
    "animation"
  )
  .option("--no-stroke", "Disable stroke animation")
  .option("--no-fill", "Disable fill animation")
  .option(
    "--stroke-duration <ms>",
    "Stroke animation duration",
    "1200"
  )
  .option("--stroke-stagger <ms>", "Stroke stagger step", "120")
  .option("--stroke-delay <ms>", "Stroke animation delay", "0")
  .option(
    "--stroke-easing <name>",
    "Stroke easing name",
    "easeInOut"
  )
  .option(
    "--stroke-direction <dir>",
    "Stroke animation direction (normal|reverse)",
    "normal"
  )
  .option("--fill-duration <ms>", "Fill animation duration", "700")
  .option("--fill-stagger <ms>", "Fill stagger step", "120")
  .option("--fill-delay <ms>", "Fill animation delay", "350")
  .option("--fill-easing <name>", "Fill easing name", "easeInOut")
  .option("--hold-duration <ms>", "Extra hold on the last frame", "500")
  .option("--keep-frames", "Keep the rendered PNG frames")
  .option("--no-progress", "Disable render progress output")
  .option("--list-easings", "Print supported easing names and exit")
  .option("--verbose", "Log animated elements")
  .action(async (input, opts) => {
    if (opts.listEasings) {
      console.log(listEasings().join("\n"));
      return;
    }

    const files = await resolveSvgFiles(input);
    if (files.length === 0) {
      console.error(`No files matched: ${input}`);
      process.exit(1);
    }

    const outDir = path.resolve(opts.output);
    fs.mkdirSync(outDir, { recursive: true });

    const options = normalizeOptions(opts);

    console.log(`Rendering ${files.length} SVG file(s) to MP4...\n`);

    for (const file of files) {
      const baseName = path.basename(file, path.extname(file));
      const outPath = path.join(outDir, `${baseName}.mp4`);
      console.log(`> ${path.basename(file)}`);
      await renderSvgToMp4(file, outPath, {
        ...options,
        onProgress: options.progress ? createProgressReporter(path.basename(file)) : null,
      });
      console.log(`  -> ${path.relative(".", outPath)}\n`);
    }

    console.log("Done!");
  });

program.parse();
