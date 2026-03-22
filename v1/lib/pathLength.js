const { svgPathProperties } = require("svg-path-properties");

function getPathLength(el, tagName) {
  switch (tagName) {
    case "path": {
      const d = el.attr("d");
      if (!d) return 1000;
      try {
        return new svgPathProperties(d).getTotalLength();
      } catch {
        return 1000;
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
      return 2 * (w + h);
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
      const points = (el.attr("points") || "")
        .trim()
        .split(/[\s,]+/)
        .map(Number);
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
      return len || 1000;
    }
    default:
      return 1000;
  }
}

module.exports = { getPathLength };
