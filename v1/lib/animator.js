const fs = require("fs");
const path = require("path");
const { listEasings } = require("./easings");
const { parseScene } = require("./scene");
const { createFrameComputer, getTotalDuration } = require("./frame");
const { createRenderer } = require("./renderer");
const { createEncoder } = require("./encoder");

async function renderSvgToMp4(inputPath, outputPath, options) {
  const startedAt = Date.now();
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;
  const svgContent = fs.readFileSync(inputPath, "utf8");
  const scene = parseScene(svgContent);

  if (scene.elements.length === 0) {
    throw new Error(`No animatable SVG shapes found in ${inputPath}`);
  }

  const getFrame = createFrameComputer(scene, options);
  const renderer = createRenderer(scene, options);
  const encoder = createEncoder(outputPath, options, renderer);
  const totalDuration = getTotalDuration(scene, options);
  const frameCount =
    Math.max(1, Math.ceil(((totalDuration + options.holdDuration) / 1000) * options.fps)) + 1;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (onProgress) {
    onProgress({
      stage: "prepare",
      elementCount: scene.elements.length,
      frameCount,
      totalDurationMs: totalDuration + options.holdDuration,
    });
  }

  try {
    let lastProgressAt = 0;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const timeMs = (frameIndex / options.fps) * 1000;
      const frameSvg = getFrame(timeMs);
      const rendered = renderer.render(frameSvg);
      await encoder.write(Buffer.from(rendered.pixels));

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

    await encoder.finish();

    if (onProgress) {
      onProgress({ stage: "done", elapsedMs: Date.now() - startedAt });
    }
  } finally {
  }
}

module.exports = { renderSvgToMp4, listEasings };
