(function () {
  "use strict";

  var MIN_SCALE = 0.6;
  var MAX_SCALE = 2.4;
  var STEP = 0.2;
  var SCALE_EPSILON = 0.001;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeScale(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return clamp(n, MIN_SCALE, MAX_SCALE);
  }

  function readScale(figure) {
    var raw = figure.getAttribute("data-mermaid-scale");
    if (raw) return normalizeScale(raw);
    return 1;
  }

  function parseViewBoxWidth(svg) {
    var viewBox = String(svg.getAttribute("viewBox") || "").trim();
    if (!viewBox) return NaN;
    var parts = viewBox.split(/\s+/);
    if (parts.length < 4) return NaN;
    return Number(parts[2]);
  }

  function parseBaseMaxWidth(svg) {
    var inlineMax = String(svg.style.maxWidth || "").trim();
    if (inlineMax.endsWith("px")) {
      var fromInline = Number(inlineMax.slice(0, -2));
      if (Number.isFinite(fromInline) && fromInline > 0) return fromInline;
    }

    var fromViewBox = parseViewBoxWidth(svg);
    if (Number.isFinite(fromViewBox) && fromViewBox > 0) return fromViewBox;

    var box = svg.getBoundingClientRect();
    if (Number.isFinite(box.width) && box.width > 0) return box.width;

    return 640;
  }

  function getBaseWidth(figure, svg) {
    var raw = figure.getAttribute("data-mermaid-base-width");
    var parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    var measured = parseBaseMaxWidth(svg);
    figure.setAttribute("data-mermaid-base-width", String(measured));
    return measured;
  }

  function applyScale(figure, svg, scale) {
    var baseWidth = getBaseWidth(figure, svg);
    var safeScale = normalizeScale(scale);
    if (Math.abs(safeScale - 1) <= SCALE_EPSILON) {
      svg.style.width = "100%";
      svg.style.maxWidth = baseWidth + "px";
      return;
    }

    var targetWidth = Math.max(1, Math.round(baseWidth * safeScale * 1000) / 1000);
    svg.style.width = targetWidth + "px";
    svg.style.maxWidth = "none";
  }

  function writeScale(figure, svg, nextScale) {
    var safeScale = normalizeScale(nextScale);
    figure.setAttribute("data-mermaid-scale", String(safeScale));
    applyScale(figure, svg, safeScale);
  }

  function bindFigure(figure) {
    if (!(figure instanceof HTMLElement)) return;
    if (figure.dataset.mermaidZoomBound === "1") return;
    var svg = figure.querySelector(".mdsone-mermaid__svg > svg");
    if (!(svg instanceof SVGElement)) return;
    figure.dataset.mermaidZoomBound = "1";
    writeScale(figure, svg, readScale(figure));
  }

  function bindAll(root) {
    var target = root && root.querySelectorAll ? root : document;
    var figures = target.querySelectorAll(".mdsone-mermaid[data-mermaid-rendered='1']");
    figures.forEach(bindFigure);
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var button = target.closest(".mdsone-mermaid__zoom-btn");
    if (!button) return;

    var figure = button.closest(".mdsone-mermaid");
    if (!(figure instanceof HTMLElement)) return;
    var svg = figure.querySelector(".mdsone-mermaid__svg > svg");
    if (!(svg instanceof SVGElement)) return;

    var action = String(button.getAttribute("data-zoom") || "").toLowerCase();
    var current = readScale(figure);
    var next = current;

    if (action === "in") next = current + STEP;
    else if (action === "out") next = current - STEP;
    else return;

    writeScale(figure, svg, next);
  });

  bindAll(document);

  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return;
          if (node.matches(".mdsone-mermaid[data-mermaid-rendered='1']")) {
            bindFigure(node);
          } else {
            bindAll(node);
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
