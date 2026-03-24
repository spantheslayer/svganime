const express = require("express");
const puppeteer = require("puppeteer");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Add !important to fill declarations in regular CSS rules, but NOT inside
// @keyframes blocks (where !important is invalid per spec and breaks animations)
function processFillCSS(css) {
  if (!css) return "";
  // Step 1: add !important to all fill declarations
  let processed = css.replace(
    /fill\s*:\s*([^;!}]+)(;|(?=\s*}))/g,
    "fill: $1 !important$2"
  );
  // Step 2: remove !important from inside @keyframes blocks
  let result = "";
  let i = 0;
  while (i < processed.length) {
    const rest = processed.substring(i);
    const m = rest.match(/^@(-webkit-)?keyframes\s+[\w-]+\s*\{/);
    if (m) {
      let depth = 1;
      let j = m[0].length;
      while (j < rest.length && depth > 0) {
        if (rest[j] === "{") depth++;
        else if (rest[j] === "}") depth--;
        j++;
      }
      result += rest.substring(0, j).replace(/ !important/g, "");
      i += j;
    } else {
      result += processed[i];
      i++;
    }
  }
  return result;
}

// Shared browser-context function: animates text with stroke-drawing effect
// Used by both server (page.evaluate) and frontend (inline call)
function getTextAnimCode() {
  return function triggerAllAnimations() {
    var svg = document.querySelector("svg");
    if (!svg) return;

    // Collect stroke-dashoffset delays for each svg-elem-N from stylesheets
    var animDelays = {};
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var rules = document.styleSheets[s].cssRules;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (!rule.selectorText) continue;
          var m = rule.selectorText.match(/svg\s+\.svg-elem-(\d+)$/);
          if (!m) continue;
          var delays = rule.style.transitionDelay;
          if (delays) {
            var first = parseFloat(delays.split(",")[0]);
            if (!isNaN(first)) animDelays[parseInt(m[1])] = first * 1000;
          }
        }
      }
    } catch (e) {}

    // Trigger shape CSS transitions
    svg.classList.add("active");
    getComputedStyle(svg).fill;

    // Helper to find delay from an animated element
    function getDelayFromEl(el) {
      var c = el.className && el.className.baseVal || "";
      var m = c.match(/svg-elem-(\d+)/);
      if (m && animDelays[parseInt(m[1])] !== undefined) return animDelays[parseInt(m[1])];
      return null;
    }

    var easing = "cubic-bezier(0.68, -0.55, 0.265, 1.55)";
    var texts = svg.querySelectorAll("text");
    var count = 0;

    texts.forEach(function(text) {
      var cls = text.className && text.className.baseVal || "";
      if (cls.indexOf("svg-elem-") !== -1) return;

      // Find delay from nearest animated sibling
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
          if (d !== null) { delay = d; break; }
          var inner = el.querySelector && el.querySelector('[class*="svg-elem-"]');
          if (inner) { d = getDelayFromEl(inner); if (d !== null) { delay = d; break; } }
          el = el.previousElementSibling;
        }
      }

      // Stroke-drawing effect: same technique as SVG Artista uses for shapes
      var fillColor = getComputedStyle(text).fill || "rgb(255,255,255)";
      var len = text.getComputedTextLength() * 3; // generous estimate for glyph path length

      // Set up stroke to match the text color
      text.setAttribute("stroke", fillColor);
      text.setAttribute("stroke-width", "0.5");
      text.setAttribute("stroke-dasharray", len);

      // Animate stroke drawing (outline writes in)
      text.animate(
        [{ strokeDashoffset: len + "px" }, { strokeDashoffset: "0px" }],
        { duration: 1000, delay: delay, easing: easing, fill: "both" }
      );

      // Animate fill (transparent → original color, starts after stroke begins)
      text.animate(
        [{ fill: "transparent" }, { fill: fillColor }],
        { duration: 700, delay: delay + 800, easing: easing, fill: "both" }
      );

      count++;
    });

    // Pause ALL animations (shapes + text) at time 0
    document.getAnimations().forEach(function(a) { a.pause(); a.currentTime = 0; });
  };
}

// SSE endpoint for generating video with progress
app.post("/api/generate", async (req, res) => {
  const { svg, css, fps = 60, holdSec = 0.5, animSec = 3.0, transparent = false } = req.body;

  if (!svg) {
    return res.status(400).json({ error: "SVG is required" });
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const jobId = crypto.randomBytes(8).toString("hex");
  const framesDir = path.join(__dirname, "tmp", jobId, "frames");
  const outputExt = transparent ? "mov" : "mp4";
  const outputPath = path.join(__dirname, "tmp", jobId, `output.${outputExt}`);

  try {
    fs.mkdirSync(framesDir, { recursive: true });

    send({ stage: "setup", message: "Preparing...", percent: 0 });

    // 1080p output; SVG scales to fit via viewBox
    const width = 1920, height = 1080;

    const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body {
    background: ${transparent ? "transparent" : "rgb(28, 28, 26)"};
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg {
    width: 100%;
    height: 100%;
  }
  ${processFillCSS(css)}
</style>
</head>
<body>${svg}</body>
</html>`;

    const htmlPath = path.join(__dirname, "tmp", jobId, "page.html");
    fs.writeFileSync(htmlPath, html);

    send({ stage: "browser", message: "Launching browser...", percent: 2 });

    const browser = await puppeteer.launch({
      headless: "new",
      args: [`--window-size=${width},${height}`],
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`file://${htmlPath}`, { waitUntil: "load" });

    const totalFrames = Math.ceil(fps * (holdSec + animSec));
    const holdFrames = Math.ceil(fps * holdSec);

    send({ stage: "capture", message: "Capturing frames...", percent: 5 });

    // Set up ALL animations (shapes + text) first, paused at t=0
    await page.evaluate(getTextAnimCode());

    // Capture hold frames from the t=0 state (everything invisible)
    const firstFrame = path.join(framesDir, "frame_00000.png");
    await page.screenshot({ path: firstFrame, type: "png", omitBackground: transparent });
    for (let i = 1; i < holdFrames; i++) {
      fs.copyFileSync(firstFrame, path.join(framesDir, `frame_${String(i).padStart(5, "0")}.png`));
    }

    // Seek and capture each animation frame
    const frameDurationMs = 1000 / fps;
    const animFrames = totalFrames - holdFrames;
    const captureStart = 5;
    const captureEnd = 85;

    for (let i = 0; i < animFrames; i++) {
      const timeMs = i * frameDurationMs;
      await page.evaluate((t) => {
        document.getAnimations().forEach((a) => { a.currentTime = t; });
      }, timeMs);

      const frameIndex = holdFrames + i;
      await page.screenshot({
        path: path.join(framesDir, `frame_${String(frameIndex).padStart(5, "0")}.png`),
        type: "png",
        omitBackground: transparent,
      });

      if (i % 10 === 0 || i === animFrames - 1) {
        const pct = Math.round(captureStart + ((i + 1) / animFrames) * (captureEnd - captureStart));
        send({
          stage: "capture",
          message: `Capturing frame ${frameIndex + 1}/${totalFrames}`,
          percent: pct,
        });
      }
    }

    await browser.close();

    send({ stage: "encode", message: "Encoding video...", percent: 88 });

    const ffmpegEncode = transparent
      ? `-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le`
      : `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow`;

    execSync(
      `ffmpeg -y -framerate ${fps} -i "${framesDir}/frame_%05d.png" ${ffmpegEncode} "${outputPath}"`,
      { stdio: "pipe" }
    );

    fs.rmSync(framesDir, { recursive: true });

    send({ stage: "encode", message: "Encoding complete", percent: 95 });

    // Read file and send as base64 so the client can trigger a download
    const videoBuffer = fs.readFileSync(outputPath);
    const base64 = videoBuffer.toString("base64");

    send({ stage: "done", message: "Done!", percent: 100, video: base64 });

    // Clean up
    fs.rmSync(path.join(__dirname, "tmp", jobId), { recursive: true, force: true });

    res.end();
  } catch (err) {
    console.error(err);
    fs.rmSync(path.join(__dirname, "tmp", jobId), { recursive: true, force: true });
    send({ stage: "error", message: err.message, percent: 0 });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
