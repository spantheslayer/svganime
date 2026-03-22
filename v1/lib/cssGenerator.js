function generateCSS(elements, options) {
  const {
    duration,
    delay,
    easing,
    stroke,
    fill,
    fillDelay,
    iteration,
    direction,
  } = options;

  let keyframes = "";
  let rules = "";

  for (const el of elements) {
    const { id, pathLength, hasStroke, hasFill } = el;
    const animateStroke = stroke && hasStroke;
    const animateFill = fill && hasFill;

    if (!animateStroke && !animateFill) continue;

    const animations = [];

    if (animateStroke) {
      keyframes += `@keyframes svganim-stroke-${id} {
  0% { stroke-dashoffset: ${pathLength}; }
  100% { stroke-dashoffset: 0; }
}\n`;
      animations.push(
        `svganim-stroke-${id} ${duration}ms ${easing} ${delay}ms ${iteration} ${direction} forwards`
      );
    }

    if (animateFill) {
      keyframes += `@keyframes svganim-fill-${id} {
  0% { fill-opacity: 0; }
  100% { fill-opacity: 1; }
}\n`;
      const totalFillDelay = delay + (animateStroke ? fillDelay : 0);
      animations.push(
        `svganim-fill-${id} ${duration}ms ${easing} ${totalFillDelay}ms ${iteration} ${direction} forwards`
      );
    }

    let rule = `.svganim-${id} {\n`;
    if (animateStroke) {
      rule += `  stroke-dasharray: ${pathLength};\n`;
      rule += `  stroke-dashoffset: ${pathLength};\n`;
    }
    if (animateFill) {
      rule += `  fill-opacity: 0;\n`;
    }
    rule += `  animation: ${animations.join(",\n             ")};\n`;
    rule += `}\n`;

    rules += rule;
  }

  return keyframes + rules;
}

module.exports = { generateCSS };
