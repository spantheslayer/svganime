const { spawn } = require("child_process");

/**
 * Spawn an FFmpeg process that accepts raw RGBA frames on stdin
 * and writes an H.264 MP4 to the output path.
 *
 * Returns { write(rgbaBuffer), finish() -> Promise<void> }
 */
function createEncoder(outputPath, options) {
  const { width, height, fps } = options;

  const args = [
    "-y",                          // overwrite output
    "-f", "rawvideo",              // input format: raw pixels
    "-pix_fmt", "rgba",            // input pixel format
    "-s", `${width}x${height}`,   // frame size
    "-r", String(fps),             // input frame rate
    "-i", "pipe:0",                // read from stdin
    "-c:v", "libx264",            // H.264 codec
    "-pix_fmt", "yuv420p",        // output pixel format (compatible)
    "-preset", "medium",           // encoding speed/quality tradeoff
    "-crf", "18",                  // quality (lower = better, 18 is visually lossless)
    "-movflags", "+faststart",     // optimize for streaming
    "-r", String(fps),             // output frame rate
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
        const ok = ffmpeg.stdin.write(rgbaBuffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
        if (!ok) {
          ffmpeg.stdin.once("drain", resolve);
        }
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
