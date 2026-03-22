const { spawn } = require("child_process");

/**
 * Spawn an FFmpeg process that accepts raw RGBA frames of the SVG content
 * (at its fitted size) on stdin, overlays them onto a solid background,
 * and outputs a 1920x1080 H.264 MP4.
 *
 * Returns { write(rgbaBuffer), finish() -> Promise<void> }
 */
function createEncoder(outputPath, options, rendererInfo) {
  const { width, height, fps, bg } = options;
  const { fitWidth, fitHeight, offsetX, offsetY } = rendererInfo;

  const args = [
    "-y",
    // Input 0: raw RGBA frames of the SVG at its fitted size
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${fitWidth}x${fitHeight}`,
    "-r", String(fps),
    "-i", "pipe:0",
    // Input 1: solid background color
    "-f", "lavfi",
    "-i", `color=c=${bg.replace("#", "0x")}:s=${width}x${height}:r=${fps}`,
    // Overlay SVG onto background, centered
    "-filter_complex", `[1:v][0:v]overlay=${offsetX}:${offsetY}:shortest=1`,
    // Output settings
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "medium",
    "-crf", "18",
    "-movflags", "+faststart",
    outputPath,
  ];

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return {
    write(rgbaBuffer) {
      return new Promise((resolve, reject) => {
        ffmpeg.stdin.write(rgbaBuffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    finish() {
      return new Promise((resolve, reject) => {
        ffmpeg.stdin.end();
        ffmpeg.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}\n${stderr.slice(-500)}`));
          }
        });
        ffmpeg.on("error", (err) => {
          reject(new Error(`FFmpeg error: ${err.message}\nIs FFmpeg installed? (brew install ffmpeg)`));
        });
      });
    },
  };
}

module.exports = { createEncoder };
