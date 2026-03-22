const cheerio = require("cheerio");
const { getPathLength } = require("./pathLength");

const ANIMATABLE_TAGS = [
  "path",
  "line",
  "polyline",
  "polygon",
  "circle",
  "ellipse",
  "rect",
];

function parseScene(svgContent) {
  const $ = cheerio.load(svgContent, { xmlMode: true });
  const svgEl = $("svg").first();

  if (!svgEl.length) {
    throw new Error("No <svg> root found in input.");
  }

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

  if (!svgWidth) {
    svgWidth = 300;
  }
  if (!svgHeight) {
    svgHeight = 150;
  }

  const elements = [];
  let id = 0;
  const selector = ANIMATABLE_TAGS.join(",");

  $(selector).each((_, node) => {
    const el = $(node);
    const tagName = node.tagName || node.name;

    const strokeVal = resolveStyle(el, "stroke");
    const fillVal = resolveStyle(el, "fill");
    const fillOpacity = resolveNumericStyle(el, "fill-opacity", 1);

    const hasStroke =
      strokeVal && strokeVal !== "none" && strokeVal !== "transparent";
    const hasFill =
      fillVal !== "none" && fillVal !== "transparent" && fillVal !== undefined;

    if (!hasStroke && !hasFill) {
      return;
    }

    const pathLength = getPathLength(el, tagName);
    if (pathLength <= 0 && hasStroke) {
      return;
    }

    const elId = id++;
    const className = `svg-elem-${elId + 1}`;
    const existingClass = el.attr("class");

    el.attr("data-anim-id", String(elId));
    el.attr("class", existingClass ? `${existingClass} ${className}` : className);

    elements.push({
      id: elId,
      tagName,
      className,
      pathLength,
      hasStroke: Boolean(hasStroke),
      hasFill: Boolean(hasFill),
      fillOpacity,
    });
  });

  return {
    $,
    elements,
    svgWidth,
    svgHeight,
    viewBox: viewBox || `0 0 ${svgWidth} ${svgHeight}`,
  };
}

function resolveStyle(el, prop) {
  let current = el;

  while (current.length) {
    const styleAttr = current.attr("style") || "";
    const match = styleAttr.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));
    if (match) {
      return match[1].trim();
    }

    const attr = current.attr(prop);
    if (attr !== undefined) {
      return attr;
    }

    current = current.parent();
    if (!current.length || current[0].type === "root") {
      break;
    }
  }

  return undefined;
}

function resolveNumericStyle(el, prop, fallback) {
  const value = resolveStyle(el, prop);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = { parseScene };
