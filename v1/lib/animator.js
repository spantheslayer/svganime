const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { once } = require("events");
const cheerio = require("cheerio");
const { Resvg } = require("@resvg/resvg-js");
const { getPathLength } = require("./pathLength");
const { getEasing, listEasings } = require("./easings");

const ANIMATABLE_TAGS = [
  "path",
  "line",
  "polyline",
  "polygon",
  "circle",
  "ellipse",
  "rect",
];

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseStyleAttribute(styleValue) {
  const styles = {};
  for (const chunk of String(styleValue || "").split(";")) {
    const separator = chunk.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = chunk.slice(0, separator).trim();
    const value = chunk.slice(separator + 1).trim();
    if (key) {
      styles[key] = value;
    }
  }
  return styles;
}

function getNodeName(node) {
  return node && node.name ? node.name.toLowerCase() : "";
}

function getPresentationValue($, el, name) {
  let current = el;

  while (current && current.length) {
    const styleValue = current.attr("style");
    if (styleValue) {
      const styles = parseStyleAttribute(styleValue);
      if (styles[name] !== undefined) {
        return styles[name];
      }
    }

    const attrValue = current.attr(name);
    if (attrValue !== undefined) {
      return attrValue;
    }

    const parentNode = current.parent();
    if (!parentNode.length || getNodeName(parentNode[0]) === "root") {
      break;
    }
    current = parentNode;
  }

  return undefined;
}

function getDefaultPaint(tagName, paintType) {
  if (paintType === "stroke") {
    return "none";
  }

  if (tagName === "line" || tagName === "polyline") {
    return "none";
  }

  return "black";
}

function getPaintValue($, el, tagName, paintType) {
  const explicitValue = getPresentationValue($, el, paintType);
  if (explicitValue !== undefined) {
    return explicitValue;
  }
  return getDefaultPaint(tagName, paintType);
}

function getOpacityValue($, el, name) {
  const value = getPresentationValue($, el, name);
  if (value === undefined) {
    return 1;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

function parseSvgLength(value) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getSvgGeometry(root) {
  const viewBox = root.attr("viewBox");
  if (viewBox) {
    const numbers = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((value) => Number.isFinite(value));

    if (numbers.length === 4 && numbers[2] > 0 && numbers[3] > 0) {
      return {
        minX: numbers[0],
        minY: numbers[1],
        width: numbers[2],
        height: numbers[3],
      };
    }
  }

  const width = parseSvgLength(root.attr("width")) || 1000;
  const height = parseSvgLength(root.attr("height")) || 1000;
  return { minX: 0, minY: 0, width, height };
}

function collectAnimatableElements($, options) {
  const elements = [];
  let index = 0;

  for (const tag of ANIMATABLE_TAGS) {
    $(tag).each((_, node) => {
      const el = $(node);
      const strokeVal = getPaintValue($, el, tag, "stroke");
      const fillVal = getPaintValue($, el, tag, "fill");

      const hasStroke =
        strokeVal && strokeVal !== "none" && strokeVal !== "transparent";
      const hasFill =
        fillVal !== "none" && fillVal !== "transparent" && fillVal !== undefined;

      if (!hasStroke && !hasFill) return;

      const pathLength = hasStroke ? getPathLength(el, tag) : 0;
      const elId = index++;
      const className = `${options.elementClass}-${elId + 1}`;

      el.addClass(className);

      elements.push({
        id: elId,
        el,
        tag,
        className,
        pathLength: Number.isFinite(pathLength) && pathLength > 0 ? pathLength : 1000,
        hasStroke,
        hasFill,
        originalFillOpacity: getOpacityValue($, el, "fill-opacity"),
      });

      if (options.verbose) {
        console.log(
          `  [${tag}] ${className} length=${pathLength.toFixed(1)} stroke=${!!hasStroke} fill=${!!hasFill}`
        );
      }
    });
  }

  return elements;
}

function getAnimatedProgress(timeMs, startMs, durationMs, easing) {
  if (timeMs <= startMs) {
    return 0;
  }

  if (durationMs <= 0) {
    return 1;
  }

  if (timeMs >= startMs + durationMs) {
    return 1;
  }

  const rawProgress = (timeMs - startMs) / durationMs;
  return easing(rawProgress);
}

function buildTimeline(elements, options) {
  const strokeEasing = getEasing(options.strokeEasing);
  const fillEasing = getEasing(options.fillEasing);
  let maxEnd = 0;

  const tracks = elements.map((element, index) => {
    const strokeEnabled = options.animateStroke && element.hasStroke;
    const fillEnabled = options.animateFill && element.hasFill;
    const strokeStart = options.strokeDelay + index * options.strokeStagger;
    const fillStart = options.fillDelay + index * options.fillStagger;
    const strokeEnd = strokeStart + (strokeEnabled ? options.strokeDuration : 0);
    const fillEnd = fillStart + (fillEnabled ? options.fillDuration : 0);

    maxEnd = Math.max(maxEnd, strokeEnd, fillEnd);

    return {
      element,
      strokeEnabled,
      fillEnabled,
      strokeStart,
      fillStart,
      strokeEasing,
      fillEasing,
    };
  });

  return {
    tracks,
    totalDuration: maxEnd + options.holdDuration,
  };
}

function applyFrameState(timeline, options, timeMs) {
  for (const track of timeline.tracks) {
    const { element, strokeEnabled, fillEnabled } = track;

    if (strokeEnabled) {
      const progress = getAnimatedProgress(
        timeMs,
        track.strokeStart,
        options.strokeDuration,
        track.strokeEasing
      );
      const startOffset =
        options.strokeDirection === "reverse"
          ? -element.pathLength
          : element.pathLength;

      element.el.attr("stroke-dasharray", formatNumber(element.pathLength));
      element.el.attr(
        "stroke-dashoffset",
        formatNumber(startOffset * (1 - progress))
      );
    }

    if (fillEnabled) {
      const progress = getAnimatedProgress(
        timeMs,
        track.fillStart,
        options.fillDuration,
        track.fillEasing
      );
      element.el.attr(
        "fill-opacity",
        formatNumber(element.originalFillOpacity * progress)
      );
    }
  }
}

function buildFrameSvg(root, geometry, options) {
  const scale = Math.min(options.width / geometry.width, options.height / geometry.height);
  const scaledWidth = geometry.width * scale;
  const scaledHeight = geometry.height * scale;
  const offsetX = (options.width - scaledWidth) / 2;
  const offsetY = (options.height - scaledHeight) / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">`,
    `  <rect width="100%" height="100%" fill="${escapeAttr(options.backgroundColor)}"/>`,
    `  <g transform="translate(${formatNumber(offsetX)} ${formatNumber(offsetY)}) scale(${formatNumber(scale)})">`,
    `    <g transform="translate(${formatNumber(-geometry.minX)} ${formatNumber(-geometry.minY)})">`,
    root.html() || "",
    "    </g>",
    "  </g>",
    "</svg>",
  ].join("\n");
}

async function renderSvgToMp4(inputPath, outputPath, options) {
  const startedAt = Date.now();
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;
  const svgContent = fs.readFileSync(inputPath, "utf8");
  const $ = cheerio.load(svgContent, { xmlMode: true });
  const root = $("svg").first();

  if (!root.length) {
    throw new Error(`No <svg> root found in ${inputPath}`);
  }

  const elements = collectAnimatableElements($, options);
  if (elements.length === 0) {
    throw new Error(`No animatable SVG shapes found in ${inputPath}`);
  }

  const geometry = getSvgGeometry(root);
  const timeline = buildTimeline(elements, options);
  const frameCount =
    Math.max(1, Math.ceil((timeline.totalDuration / 1000) * options.fps)) + 1;
  const framesDir = options.keepFrames
    ? fs.mkdtempSync(path.join(os.tmpdir(), "svganim-frames-"))
    : null;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (onProgress) {
    onProgress({
      stage: "prepare",
      elementCount: elements.length,
      frameCount,
      totalDurationMs: timeline.totalDuration,
    });
  }

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${options.width}x${options.height}`,
      "-r",
      String(options.fps),
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      String(options.fps),
      outputPath,
    ],
    { stdio: ["pipe", "ignore", "pipe"] }
  );

  let ffmpegError = "";
  ffmpeg.stderr.on("data", (chunk) => {
    ffmpegError += chunk.toString();
  });

  try {
    let lastProgressAt = 0;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const timeMs = (frameIndex / options.fps) * 1000;
      applyFrameState(timeline, options, timeMs);

      const frameSvg = buildFrameSvg(root, geometry, options);
      const rendered = new Resvg(frameSvg).render();

      if (framesDir) {
        const framePath = path.join(
          framesDir,
          `frame-${String(frameIndex).padStart(5, "0")}.png`
        );
        fs.writeFileSync(framePath, rendered.asPng());
      }

      if (!ffmpeg.stdin.write(rendered.pixels)) {
        await once(ffmpeg.stdin, "drain");
      }

      if (onProgress) {
        const now = Date.now();
        const done = frameIndex === frameCount - 1;
        if (done || now - lastProgressAt >= 100) {
          lastProgressAt = now;
          onProgress({
            stage: "render",
            frameIndex: frameIndex + 1,
            frameCount,
            percent: (frameIndex + 1) / frameCount,
            done,
          });
        }
      }
    }

    if (onProgress) {
      onProgress({ stage: "encode" });
    }

    ffmpeg.stdin.end();
    const [exitCode] = await once(ffmpeg, "close");
    if (exitCode !== 0) {
      throw new Error(ffmpegError || "ffmpeg failed to encode the MP4.");
    }

    if (onProgress) {
      onProgress({ stage: "done", elapsedMs: Date.now() - startedAt });
    }
  } finally {
    if (!ffmpeg.killed) {
      ffmpeg.stdin.destroy();
    }

    if (framesDir && !options.keepFrames) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    }
  }
}

module.exports = { renderSvgToMp4, listEasings };
