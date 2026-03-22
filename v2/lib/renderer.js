const { Resvg } = require("@resvg/resvg-js");

/**
 * Creates a reusable frame renderer for a scene.
 * Pre-computes the wrapper SVG template so each frame only does
 * string substitution + resvg render.
 *
 * Returns: (svgXml) => { pixels, width, height }
 */
function createRenderer(scene, options) {
  const { width, height, bg, padding } = options;

  const availW = width - padding * 2;
  const availH = height - padding * 2;

  const scaleX = availW / scene.svgWidth;
  const scaleY = availH / scene.svgHeight;
  const scale = Math.min(scaleX, scaleY);

  const scaledW = scene.svgWidth * scale;
  const scaledH = scene.svgHeight * scale;

  const offsetX = (width - scaledW) / 2;
  const offsetY = (height - scaledH) / 2;

  // Extract namespace declarations from original SVG
  const origSvg = scene.xml();
  const attrMatch = origSvg.match(/<svg([^>]*)>/i);
  const origAttrs = attrMatch ? attrMatch[1] : "";
  const nsMatches = origAttrs.match(/xmlns[^=]*="[^"]*"/g) || [];
  const extraNs = nsMatches.filter((ns) => !ns.startsWith('xmlns="')).join(" ");

  // Pre-build the wrapper prefix and suffix
  const prefix = `<svg xmlns="http://www.w3.org/2000/svg" ${extraNs} width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${bg}"/>` +
    `<svg x="${offsetX}" y="${offsetY}" width="${scaledW}" height="${scaledH}" viewBox="${scene.viewBox}">`;
  const suffix = `</svg></svg>`;

  const resvgOpts = { fitTo: { mode: "width", value: width } };

  return function renderFrame(svgXml) {
    // Extract inner content from the frame SVG
    const innerMatch = svgXml.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    const inner = innerMatch ? innerMatch[1] : svgXml;

    const wrapped = prefix + inner + suffix;

    const resvg = new Resvg(wrapped, resvgOpts);
    const rendered = resvg.render();

    return {
      pixels: rendered.pixels,
      width: rendered.width,
      height: rendered.height,
    };
  };
}

module.exports = { createRenderer };
