const { getEasing } = require("./easings");

function createFrameComputer(scene, options) {
  const {
    animateStroke,
    animateFill,
    strokeDuration,
    strokeDelay,
    strokeStagger,
    strokeEasing,
    strokeDirection,
    fillDuration,
    fillDelay,
    fillStagger,
    fillEasing,
  } = options;

  const strokeEasingFn = getEasing(strokeEasing);
  const fillEasingFn = getEasing(fillEasing);
  const $ = scene.$;
  const placeholders = [];

  for (const element of scene.elements) {
    const node = $(`[data-anim-id="${element.id}"]`);
    if (!node.length) {
      continue;
    }

    const strokeToken = `__SOFF_${element.id}__`;
    const fillToken = `__FOPA_${element.id}__`;

    if (animateStroke && element.hasStroke && element.pathLength > 0) {
      node.attr("stroke-dasharray", String(element.pathLength));
      node.attr("stroke-dashoffset", strokeToken);
    }

    if (animateFill && element.hasFill) {
      node.attr("fill-opacity", fillToken);
    }

    placeholders.push({
      element,
      strokeToken:
        animateStroke && element.hasStroke && element.pathLength > 0
          ? strokeToken
          : null,
      fillToken: animateFill && element.hasFill ? fillToken : null,
    });
  }

  const template = $.xml();

  return function computeFrame(timeMs) {
    let svg = template;

    for (const { element, strokeToken, fillToken } of placeholders) {
      if (strokeToken) {
        const strokeStart = strokeDelay + strokeStagger * element.id;
        const progress = computeProgress(timeMs, strokeStart, strokeDuration);
        const eased = strokeEasingFn(progress);
        const startOffset =
          strokeDirection === "reverse"
            ? -element.pathLength
            : element.pathLength;
        const offset = startOffset * (1 - eased);

        svg = svg.replace(strokeToken, formatNumber(offset));
      }

      if (fillToken) {
        const fillStart = fillDelay + fillStagger * element.id;
        const progress = computeProgress(timeMs, fillStart, fillDuration);
        const eased = fillEasingFn(progress);
        const opacity = Math.max(0, Math.min(1, eased * element.fillOpacity));

        svg = svg.replace(fillToken, formatNumber(opacity));
      }
    }

    return svg;
  };
}

function computeProgress(timeMs, startTime, duration) {
  if (timeMs <= startTime) {
    return 0;
  }

  if (duration <= 0) {
    return 1;
  }

  if (timeMs >= startTime + duration) {
    return 1;
  }

  return (timeMs - startTime) / duration;
}

function getTotalDuration(scene, options) {
  let maxEnd = 0;

  for (const element of scene.elements) {
    if (options.animateStroke && element.hasStroke && element.pathLength > 0) {
      maxEnd = Math.max(
        maxEnd,
        options.strokeDelay + options.strokeStagger * element.id + options.strokeDuration
      );
    }

    if (options.animateFill && element.hasFill) {
      maxEnd = Math.max(
        maxEnd,
        options.fillDelay + options.fillStagger * element.id + options.fillDuration
      );
    }
  }

  return maxEnd;
}

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

module.exports = { createFrameComputer, getTotalDuration };
