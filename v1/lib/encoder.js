const { spawn } = require("child_process");

function createEncoder(outputPath, options, rendererInfo) {
  const { width, height, fps, backgroundColor } = options;
  const { fitWidth, fitHeight, offsetX, offsetY } = rendererInfo;

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${fitWidth}x${fitHeight}`,
    "-r",
    String(fps),
    "-i",
    "pipe:0",
    "-f",
    "lavfi",
    "-i",
    `color=c=${normalizeColor(backgroundColor)}:s=${width}x${height}:r=${fps}`,
    "-filter_complex",
    `[1:v][0:v]overlay=${offsetX}:${offsetY}:shortest=1`,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: ["pipe", "ignore", "pipe"],
  });

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return {
    write(frameBuffer) {
      return new Promise((resolve, reject) => {
        ffmpeg.stdin.write(frameBuffer, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    finish() {
      return new Promise((resolve, reject) => {
        ffmpeg.stdin.end();
        ffmpeg.once("error", (error) => {
          reject(new Error(`FFmpeg error: ${error.message}`));
        });
        ffmpeg.once("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderr || `FFmpeg exited with code ${code}.`));
        });
      });
    },
  };
}

function normalizeColor(color) {
  return String(color).trim().replace(/^#/, "0x");
}

module.exports = { createEncoder };
