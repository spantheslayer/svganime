const puppeteer = require("puppeteer");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FPS = 60;
const HOLD_SEC = 0.5; // hold initial state before animation starts
const ANIM_SEC = 3.0; // animation completes ~2.6s, pad a bit
const DURATION_SEC = HOLD_SEC + ANIM_SEC;
const TOTAL_FRAMES = Math.ceil(FPS * DURATION_SEC);
const WIDTH = 680;
const HEIGHT = 440;
const FRAMES_DIR = path.join(__dirname, "frames");
const OUTPUT = path.join(__dirname, "output.mp4");

async function main() {
  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true });
  }
  fs.mkdirSync(FRAMES_DIR);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });

  const htmlPath = path.join(__dirname, "animation.html");
  await page.goto(`file://${htmlPath}`, { waitUntil: "load" });

  // Capture hold frames (initial state, before animation)
  const holdFrames = Math.ceil(FPS * HOLD_SEC);
  const firstFramePath = path.join(FRAMES_DIR, `frame_${String(0).padStart(5, "0")}.png`);
  await page.screenshot({ path: firstFramePath, type: "png" });

  // Reuse the same screenshot for all hold frames
  for (let i = 1; i < holdFrames; i++) {
    fs.copyFileSync(firstFramePath, path.join(FRAMES_DIR, `frame_${String(i).padStart(5, "0")}.png`));
  }

  // Trigger the animation, then immediately pause all animations
  await page.evaluate(() => {
    document.querySelector("svg").classList.add("active");
    // Pause all CSS transition-backed animations at time 0
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
  });

  // Capture animation frames by seeking to exact times
  const animFrames = TOTAL_FRAMES - holdFrames;
  const frameDurationMs = 1000 / FPS;

  for (let i = 0; i < animFrames; i++) {
    const timeMs = i * frameDurationMs;

    // Seek all animations to the exact time
    await page.evaluate((t) => {
      document.getAnimations().forEach((a) => {
        a.currentTime = t;
      });
    }, timeMs);

    const frameIndex = holdFrames + i;
    const framePath = path.join(FRAMES_DIR, `frame_${String(frameIndex).padStart(5, "0")}.png`);
    await page.screenshot({ path: framePath, type: "png" });

    if (frameIndex % 30 === 0) {
      console.log(`Frame ${frameIndex}/${TOTAL_FRAMES} (t=${(timeMs / 1000).toFixed(2)}s)`);
    }
  }

  await browser.close();

  console.log(`Captured ${TOTAL_FRAMES} frames. Encoding to video...`);

  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${FRAMES_DIR}/frame_%05d.png" ` +
      `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow ` +
      `"${OUTPUT}"`,
    { stdio: "inherit" }
  );

  fs.rmSync(FRAMES_DIR, { recursive: true });

  console.log(`Done! Video saved to ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
