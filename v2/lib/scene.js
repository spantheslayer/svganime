const cheerio = require("cheerio");
const { getPathLength } = require("./pathLength");

const ANIMATABLE_TAGS = ["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"];

/**
 * Parse an SVG string and extract all animatable elements with their metadata.
 * Returns a scene object: { $, elements, svgWidth, svgHeight, viewBox }
 */
function parseScene(svgContent) {
  const $ = cheerio.load(svgContent, { xmlMode: true });
  const svgEl = $("svg").first();

  // Extract intrinsic dimensions
  const viewBox = svgEl.attr("viewBox");
  let svgWidth = parseFloat(svgEl.attr("width")) || 0;
  let svgHeight = parseFloat(svgEl.attr("height")) || 0;

  if (viewBox && (!svgWidth || !svgHeight)) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      svgWidth = svgWidth || parts[2];
      svgHeight = svgHeight || parts[3];
    }
  }

  // Fallback
  if (!svgWidth) svgWidth = 300;
  if (!svgHeight) svgHeight = 150;

  // Collect animatable elements in document order
  const elements = [];
  let id = 0;

  const selector = ANIMATABLE_TAGS.join(",");
  $(selector).each((_, node) => {
    const el = $(node);
    const tagName = node.tagName || node.name;

    if (el.attr("data-no-animate") !== undefined) return;

    const strokeVal = resolveStyle(el, $, "stroke");
    const fillVal = resolveStyle(el, $, "fill");

    const hasStroke = strokeVal && strokeVal !== "none" && strokeVal !== "transparent";
    const hasFill = fillVal !== "none" && fillVal !== "transparent" && fillVal !== undefined;

    if (!hasStroke && !hasFill) return;

    const pathLength = getPathLength(el, tagName);
    if (pathLength <= 0 && hasStroke) return; // skip zero-length strokes

    const elId = id++;
    el.attr("data-anim-id", String(elId));

    elements.push({
      id: elId,
      tagName,
      pathLength,
      hasStroke: !!hasStroke,
      hasFill: !!hasFill,
    });
  });

  return {
    $,
    elements,
    svgWidth,
    svgHeight,
    viewBox: viewBox || `0 0 ${svgWidth} ${svgHeight}`,
    xml: () => $.xml(),
  };
}

function resolveStyle(el, $, prop) {
  const styleAttr = el.attr("style") || "";
  const inlineMatch = styleAttr.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));
  if (inlineMatch) return inlineMatch[1].trim();

  const attr = el.attr(prop);
  if (attr !== undefined) return attr;

  let parent = el.parent();
  while (parent.length && parent[0].tagName !== "svg" && parent[0].name !== "svg") {
    const pStyle = parent.attr("style") || "";
    const pMatch = pStyle.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));
    if (pMatch) return pMatch[1].trim();

    const pAttr = parent.attr(prop);
    if (pAttr !== undefined) return pAttr;
    parent = parent.parent();
  }

  return undefined;
}

module.exports = { parseScene };
