const { getEasing } = require("./easings");

/**
 * Pre-compute a frame renderer for a scene. This parses the SVG once and
 * creates a fast string-template approach for each frame.
 *
 * Returns a function: (timeMs) => svgString
 */
function createFrameComputer(scene, options) {
  const {
    stroke, strokeMode, strokeDuration, strokeDelay, strokeEasing,
    fill, fillDuration, fillDelay, fillEasing,
    stagger, iteration, direction,
  } = options;

  const strokeEasingFn = getEasing(strokeEasing);
  const fillEasingFn = getEasing(fillEasing);
  const iterCount = iteration === "infinite" ? Infinity : parseInt(iteration) || 1;

  // Build a template: for each animatable element, insert placeholders
  // that we can fill per-frame via string replacement.
  const $ = scene.$;
  const placeholders = [];

  for (const el of scene.elements) {
    const node = $(`[data-anim-id="${el.id}"]`);
    if (!node.length) continue;

    // Add placeholder attributes with unique tokens
    const strokeToken = `__SOFF_${el.id}__`;
    const fillToken = `__FOPA_${el.id}__`;

    if (stroke && el.hasStroke && el.pathLength > 0) {
      node.attr("stroke-dasharray", String(el.pathLength));
      node.attr("stroke-dashoffset", strokeToken);
    }

    if (fill && el.hasFill) {
      node.attr("fill-opacity", fillToken);
    }

    placeholders.push({
      el,
      strokeToken: stroke && el.hasStroke && el.pathLength > 0 ? strokeToken : null,
      fillToken: fill && el.hasFill ? fillToken : null,
    });
  }

  // Serialize the template SVG once
  const template = $.xml();

  // Return a fast frame function that does string replacement
  return function computeFrame(timeMs) {
    let svg = template;

    for (const { el, strokeToken, fillToken } of placeholders) {
      const elementDelay = stagger * el.id;

      if (strokeToken) {
        const startTime = strokeDelay + elementDelay;
        const progress = computeProgress(timeMs, startTime, strokeDuration, iterCount, direction);
        const eased = strokeEasingFn(progress);

        let offset;
        if (strokeMode === "draw") {
          offset = el.pathLength * (1 - eased);
        } else if (strokeMode === "erase") {
          offset = el.pathLength * eased;
        } else {
          // draw-erase: triangle wave
          const tri = eased <= 0.5 ? eased * 2 : 2 - eased * 2;
          offset = el.pathLength * (1 - tri);
        }

        svg = svg.replace(strokeToken, String(offset));
      }

      if (fillToken) {
        const fillStart = fillDelay + elementDelay + (stroke && el.hasStroke ? strokeDuration : 0);
        const progress = computeProgress(timeMs, fillStart, fillDuration, iterCount, direction);
        const eased = fillEasingFn(progress);
        const opacity = Math.max(0, Math.min(1, eased));

        svg = svg.replace(fillToken, String(opacity));
      }
    }

    return svg;
  };
}

function computeProgress(timeMs, startTime, duration, iterations, direction) {
  if (timeMs < startTime) return 0;
  if (duration <= 0) return 1;

  const elapsed = timeMs - startTime;
  const rawProgress = elapsed / duration;

  if (rawProgress >= iterations) {
    return getFinalValue(iterations, direction);
  }

  const currentIter = Math.floor(rawProgress);
  let p = rawProgress - currentIter;

  switch (direction) {
    case "reverse":
      p = 1 - p;
      break;
    case "alternate":
      if (currentIter % 2 === 1) p = 1 - p;
      break;
    case "alternate-reverse":
      if (currentIter % 2 === 0) p = 1 - p;
      break;
  }

  return Math.max(0, Math.min(1, p));
}

function getFinalValue(iterations, direction) {
  if (iterations === Infinity) return 1;
  switch (direction) {
    case "normal": return 1;
    case "reverse": return 0;
    case "alternate": return iterations % 2 === 0 ? 0 : 1;
    case "alternate-reverse": return iterations % 2 === 0 ? 1 : 0;
    default: return 1;
  }
}

function getTotalDuration(scene, options) {
  const {
    stroke, strokeDuration, strokeDelay,
    fill, fillDuration, fillDelay,
    stagger, iteration,
  } = options;

  const iterCount = iteration === "infinite" ? 1 : parseInt(iteration) || 1;
  let maxEnd = 0;

  for (const el of scene.elements) {
    const elementDelay = stagger * el.id;

    if (stroke && el.hasStroke && el.pathLength > 0) {
      const end = strokeDelay + elementDelay + strokeDuration * iterCount;
      maxEnd = Math.max(maxEnd, end);
    }

    if (fill && el.hasFill) {
      const fillStart = fillDelay + elementDelay + (stroke && el.hasStroke ? strokeDuration : 0);
      const end = fillStart + fillDuration * iterCount;
      maxEnd = Math.max(maxEnd, end);
    }
  }

  return maxEnd;
}

module.exports = { createFrameComputer, getTotalDuration };
