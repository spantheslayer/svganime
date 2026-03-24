const puppeteer = require("puppeteer");
const path = require("path");

// Copy the exact function from server.js
function getTextAnimCode() {
  return function triggerAllAnimations() {
    var svg = document.querySelector("svg");
    if (!svg) return;
    var animDelays = {};
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var rules = document.styleSheets[s].cssRules;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (!rule.selectorText) continue;
          var m = rule.selectorText.match(/svg\s+\.svg-elem-(\d+)$/);
          if (!m) continue;
          var delays = rule.style.transitionDelay;
          if (delays) {
            var first = parseFloat(delays.split(",")[0]);
            if (!isNaN(first)) animDelays[parseInt(m[1])] = first * 1000;
          }
        }
      }
    } catch (e) {}

    svg.classList.add("active");
    getComputedStyle(svg).fill;

    function getDelayFromEl(el) {
      var c = el.className && el.className.baseVal || "";
      var m = c.match(/svg-elem-(\d+)/);
      if (m && animDelays[parseInt(m[1])] !== undefined) return animDelays[parseInt(m[1])];
      return null;
    }

    var easing = "cubic-bezier(0.68, -0.55, 0.265, 1.55)";
    var texts = svg.querySelectorAll("text");
    var count = 0;
    texts.forEach(function(text) {
      var cls = text.className && text.className.baseVal || "";
      if (cls.indexOf("svg-elem-") !== -1) return;
      var delay = count * 100;
      var parent = text.parentElement;
      var sib = parent && parent.querySelector('[class*="svg-elem-"]');
      if (sib) {
        var d = getDelayFromEl(sib);
        if (d !== null) delay = d;
      } else {
        var el = text.previousElementSibling;
        while (el) {
          var d = getDelayFromEl(el);
          if (d !== null) { delay = d; break; }
          var inner = el.querySelector && el.querySelector('[class*="svg-elem-"]');
          if (inner) { d = getDelayFromEl(inner); if (d !== null) { delay = d; break; } }
          el = el.previousElementSibling;
        }
      }
      var fillColor = getComputedStyle(text).fill || "rgb(255,255,255)";
      var len = text.getComputedTextLength() * 3;
      text.setAttribute("stroke", fillColor);
      text.setAttribute("stroke-width", "0.5");
      text.setAttribute("stroke-dasharray", len);
      text.animate([{strokeDashoffset: len+"px"}, {strokeDashoffset: "0px"}],
        {duration:1000, delay:delay, easing:easing, fill:"both"});
      text.animate([{fill:"transparent"}, {fill:fillColor}],
        {duration:700, delay:delay+800, easing:easing, fill:"both"});
      count++;
    });
    document.getAnimations().forEach(function(a) { a.pause(); a.currentTime = 0; });
  };
}

async function main() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 680, height: 440 });
  await page.goto(`file://${path.join(__dirname, "animation.html")}`, { waitUntil: "load" });

  // Test with getTextAnimCode() — exactly how server calls it
  await page.evaluate(getTextAnimCode());

  const count = await page.evaluate(() => document.getAnimations().length);
  console.log("getTextAnimCode() → animations:", count);

  await browser.close();
}
main();
