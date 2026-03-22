const { svgPathProperties } = require("svg-path-properties");

function getPathLength(el, tagName) {
  let raw = rawLength(el, tagName);

  const transform = el.attr("transform");
  if (transform) {
    const scaleMatch = transform.match(/scale\(\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (scaleMatch) {
      const sx = parseFloat(scaleMatch[1]);
      const sy = parseFloat(scaleMatch[2] || scaleMatch[1]);
      raw *= Math.sqrt((sx * sx + sy * sy) / 2);
    }
  }

  return raw;
}

function rawLength(el, tagName) {
  switch (tagName) {
    case "path": {
      const d = el.attr("d");
      if (!d) return 0;
      try {
        return new svgPathProperties(d).getTotalLength();
      } catch {
        return 0;
      }
    }
    case "circle": {
      const r = parseFloat(el.attr("r")) || 0;
      return 2 * Math.PI * r;
    }
    case "ellipse": {
      const rx = parseFloat(el.attr("rx")) || 0;
      const ry = parseFloat(el.attr("ry")) || 0;
      // Ramanujan approximation
      return Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    }
    case "rect": {
      const w = parseFloat(el.attr("width")) || 0;
      const h = parseFloat(el.attr("height")) || 0;
      const rx = Math.min(parseFloat(el.attr("rx")) || 0, w / 2);
      const ry = Math.min(parseFloat(el.attr("ry")) || 0, h / 2);
      const straight = 2 * (w - 2 * rx) + 2 * (h - 2 * ry);
      const corners =
        rx > 0 || ry > 0
          ? Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
          : 0;
      return straight + corners;
    }
    case "line": {
      const x1 = parseFloat(el.attr("x1")) || 0;
      const y1 = parseFloat(el.attr("y1")) || 0;
      const x2 = parseFloat(el.attr("x2")) || 0;
      const y2 = parseFloat(el.attr("y2")) || 0;
      return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    case "polyline":
    case "polygon": {
      const raw = (el.attr("points") || "").trim();
      if (!raw) return 0;
      const points = raw.split(/[\s,]+/).map(Number);
      let len = 0;
      for (let i = 2; i < points.length; i += 2) {
        len += Math.sqrt(
          (points[i] - points[i - 2]) ** 2 +
            (points[i + 1] - points[i - 1]) ** 2
        );
      }
      if (tagName === "polygon" && points.length >= 4) {
        len += Math.sqrt(
          (points[0] - points[points.length - 2]) ** 2 +
            (points[1] - points[points.length - 1]) ** 2
        );
      }
      return len;
    }
    default:
      return 0;
  }
}

module.exports = { getPathLength };
