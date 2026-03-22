const { Resvg } = require("@resvg/resvg-js");

function createRenderer(scene, options) {
  const { width, height } = options;

  const scale = Math.min(width / scene.svgWidth, height / scene.svgHeight);
  const fitWidth = Math.max(1, Math.round(scene.svgWidth * scale));
  const fitHeight = Math.max(1, Math.round(scene.svgHeight * scale));
  const offsetX = Math.round((width - fitWidth) / 2);
  const offsetY = Math.round((height - fitHeight) / 2);

  const fitTo =
    fitWidth >= fitHeight
      ? { mode: "width", value: fitWidth }
      : { mode: "height", value: fitHeight };

  return {
    fitWidth,
    fitHeight,
    offsetX,
    offsetY,
    render(svgXml) {
      const rendered = new Resvg(svgXml, { fitTo }).render();

      return {
        pixels: rendered.pixels,
        width: rendered.width,
        height: rendered.height,
      };
    },
  };
}

module.exports = { createRenderer };
