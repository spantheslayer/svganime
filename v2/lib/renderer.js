const { Resvg } = require("@resvg/resvg-js");

/**
 * Creates a reusable frame renderer for a scene.
 * Renders the SVG at its fitted size (much smaller than 1920x1080),
 * letting FFmpeg handle background + centering for speed.
 *
 * Returns: { render(svgXml) => { pixels, width, height }, fitWidth, fitHeight, offsetX, offsetY }
 */
function createRenderer(scene, options) {
  const { width, height, padding } = options;

  const availW = width - padding * 2;
  const availH = height - padding * 2;

  const scaleX = availW / scene.svgWidth;
  const scaleY = availH / scene.svgHeight;
  const scale = Math.min(scaleX, scaleY);

  // Pixel-aligned fitted dimensions
  const fitWidth = Math.round(scene.svgWidth * scale);
  const fitHeight = Math.round(scene.svgHeight * scale);

  const offsetX = Math.round((width - fitWidth) / 2);
  const offsetY = Math.round((height - fitHeight) / 2);

  const resvgOpts = { fitTo: { mode: "width", value: fitWidth } };

  return {
    fitWidth,
    fitHeight,
    offsetX,
    offsetY,

    render(svgXml) {
      const resvg = new Resvg(svgXml, resvgOpts);
      const rendered = resvg.render();

      return {
        pixels: rendered.pixels,
        width: rendered.width,
        height: rendered.height,
      };
    },
  };
}

module.exports = { createRenderer };
