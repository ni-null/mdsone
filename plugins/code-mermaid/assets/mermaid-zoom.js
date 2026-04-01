(function () {
  "use strict";

  var MIN_SCALE = 0.6;
  var MAX_SCALE = Number.POSITIVE_INFINITY;
  var STEP = 0.2;
  var PAN_STEP = 120;
  var SCALE_EPSILON = 0.001;
  var ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var boundFigures = new Set();
  var fullscreenListenersBound = false;

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
    // Re-sync base width from current rendered size so first zoom step
    // matches what user actually sees (especially on mobile layouts).
    var currentScale = readScale(figure);
    var currentRect = svg.getBoundingClientRect();
    if (Number.isFinite(currentRect.width) && currentRect.width > 0 && currentScale > SCALE_EPSILON) {
      var dynamicBase = currentRect.width / currentScale;
      if (Number.isFinite(dynamicBase) && dynamicBase > 0) {
        figure.setAttribute("data-mermaid-base-width", String(dynamicBase));
      }
    }

    var safeScale = normalizeScale(nextScale);
    figure.setAttribute("data-mermaid-scale", String(safeScale));
    applyScale(figure, svg, safeScale);
  }

  function getViewport(figure) {
    if (!(figure instanceof HTMLElement)) return null;
    var viewport = figure.querySelector(".mdsone-mermaid__viewport");
    return viewport instanceof HTMLElement ? viewport : null;
  }

  function getSvgContainer(figure) {
    if (!(figure instanceof HTMLElement)) return null;
    var container = figure.querySelector(".mdsone-mermaid__svg");
    return container instanceof HTMLElement ? container : null;
  }

  function readPan(figure) {
    if (!(figure instanceof HTMLElement)) return { x: 0, y: 0 };
    var x = Number(figure.getAttribute("data-mermaid-pan-x"));
    var y = Number(figure.getAttribute("data-mermaid-pan-y"));
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  }

  function writePan(figure, pan) {
    if (!(figure instanceof HTMLElement)) return;
    var container = getSvgContainer(figure);
    if (!(container instanceof HTMLElement)) return;

    var x = Number.isFinite(pan.x) ? pan.x : 0;
    var y = Number.isFinite(pan.y) ? pan.y : 0;
    figure.setAttribute("data-mermaid-pan-x", String(x));
    figure.setAttribute("data-mermaid-pan-y", String(y));
    container.style.setProperty("--mdsone-mermaid-pan-x", x + "px");
    container.style.setProperty("--mdsone-mermaid-pan-y", y + "px");
  }

  function lockViewportSize(figure, viewport) {
    if (!(figure instanceof HTMLElement)) return;
    if (!(viewport instanceof HTMLElement)) return;
    if (figure.dataset.mermaidViewportLocked === "1") return;

    var width = viewport.clientWidth;
    if (Number.isFinite(width) && width > 0) {
      viewport.style.width = Math.ceil(width) + "px";
    }

    figure.dataset.mermaidViewportLocked = "1";
  }

  function getFullscreenElement() {
    return document.fullscreenElement
      || document.webkitFullscreenElement
      || null;
  }

  function isFigureFullscreen(figure) {
    return getFullscreenElement() === figure;
  }

  function isTouchLikeDevice() {
    return (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches)
      || ("ontouchstart" in window)
      || (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0);
  }

  function shouldEnableGestureDrag(figure) {
    // Desktop: always allow drag.
    // Mobile/touch: only allow drag while in fullscreen to preserve page scrolling.
    if (!isTouchLikeDevice()) return true;
    return isFigureFullscreen(figure);
  }

  function requestFigureFullscreen(figure) {
    if (figure.requestFullscreen) return figure.requestFullscreen();
    if (figure.webkitRequestFullscreen) return figure.webkitRequestFullscreen();
    return Promise.reject(new Error("fullscreen not supported"));
  }

  function exitAnyFullscreen() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    return Promise.resolve();
  }

  function updateFullscreenButtonState(figure) {
    if (!(figure instanceof HTMLElement)) return;
    var button = figure.querySelector(".mdsone-mermaid__fullscreen-btn");
    if (!(button instanceof HTMLButtonElement)) return;
    var active = isFigureFullscreen(figure);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
    button.setAttribute("title", active ? "Exit fullscreen" : "Enter fullscreen");
  }

  function relockViewportSize(figure) {
    if (!(figure instanceof HTMLElement)) return;
    var viewport = getViewport(figure);
    if (!(viewport instanceof HTMLElement)) return;
    viewport.style.width = "";
    viewport.style.height = "";
    figure.dataset.mermaidViewportLocked = "0";
    lockViewportSize(figure, viewport);
  }

  function snapshotInlineViewState(figure) {
    if (!(figure instanceof HTMLElement)) return;
    var pan = readPan(figure);
    figure.setAttribute("data-mermaid-inline-scale", String(readScale(figure)));
    figure.setAttribute("data-mermaid-inline-pan-x", String(pan.x));
    figure.setAttribute("data-mermaid-inline-pan-y", String(pan.y));
    figure.dataset.mermaidInlineSnapshot = "1";
  }

  function restoreInlineViewState(figure) {
    if (!(figure instanceof HTMLElement)) return;
    if (figure.dataset.mermaidInlineSnapshot !== "1") return;
    var svg = figure.querySelector(".mdsone-mermaid__svg > svg");
    if (!(svg instanceof SVGElement)) return;

    var scale = Number(figure.getAttribute("data-mermaid-inline-scale"));
    var panX = Number(figure.getAttribute("data-mermaid-inline-pan-x"));
    var panY = Number(figure.getAttribute("data-mermaid-inline-pan-y"));
    writeScale(figure, svg, Number.isFinite(scale) ? scale : 1);
    writePan(figure, {
      x: Number.isFinite(panX) ? panX : 0,
      y: Number.isFinite(panY) ? panY : 0,
    });

    figure.removeAttribute("data-mermaid-inline-scale");
    figure.removeAttribute("data-mermaid-inline-pan-x");
    figure.removeAttribute("data-mermaid-inline-pan-y");
    delete figure.dataset.mermaidInlineSnapshot;
  }

  function syncFullscreenStateForFigure(figure) {
    if (!(figure instanceof HTMLElement)) return;
    if (!figure.isConnected) return;
    updateFullscreenButtonState(figure);
    if (isFigureFullscreen(figure)) {
      if (figure.dataset.mermaidInlineSnapshot !== "1") {
        snapshotInlineViewState(figure);
      }
      var viewport = getViewport(figure);
      if (viewport instanceof HTMLElement) {
        viewport.style.width = "";
        viewport.style.height = "";
        figure.dataset.mermaidViewportLocked = "0";
      }
    } else {
      restoreInlineViewState(figure);
      relockViewportSize(figure);
    }
  }

  function syncAllFullscreenStates() {
    boundFigures.forEach(function (figure) {
      if (!(figure instanceof HTMLElement) || !figure.isConnected) {
        boundFigures.delete(figure);
        return;
      }
      syncFullscreenStateForFigure(figure);
    });
  }

  function ensureFullscreenListeners() {
    if (fullscreenListenersBound) return;
    fullscreenListenersBound = true;
    document.addEventListener("fullscreenchange", syncAllFullscreenStates);
    document.addEventListener("webkitfullscreenchange", syncAllFullscreenStates);
  }

  function bindFullscreenState(figure) {
    if (!(figure instanceof HTMLElement)) return;
    if (figure.dataset.mermaidFullscreenBound === "1") return;
    figure.dataset.mermaidFullscreenBound = "1";
    boundFigures.add(figure);
    ensureFullscreenListeners();
    syncFullscreenStateForFigure(figure);
  }

  function toggleFigureFullscreen(figure) {
    if (!(figure instanceof HTMLElement)) return;
    if (isFigureFullscreen(figure)) {
      exitAnyFullscreen().catch(function () {
        // Ignore fullscreen exit errors.
      });
      return;
    }

    requestFigureFullscreen(figure).catch(function () {
      // Ignore fullscreen errors for unsupported browsers.
    });
  }

  function bindViewportDrag(figure) {
    if (!(figure instanceof HTMLElement)) return;
    var viewport = getViewport(figure);
    if (!(viewport instanceof HTMLElement)) return;
    if (viewport.dataset.mermaidDragBound === "1") return;
    viewport.dataset.mermaidDragBound = "1";

    var dragState = null;

    viewport.addEventListener("pointerdown", function (event) {
      if (!(event instanceof PointerEvent)) return;
      if (event.button !== 0) return;
      if (!shouldEnableGestureDrag(figure)) return;
      var target = event.target;
      if (target instanceof Element && target.closest(".mdsone-mermaid__controls")) return;

      var pan = readPan(figure);
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    viewport.addEventListener("pointermove", function (event) {
      if (!(event instanceof PointerEvent)) return;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      if (!shouldEnableGestureDrag(figure)) return;
      var dx = event.clientX - dragState.startX;
      var dy = event.clientY - dragState.startY;
      writePan(figure, {
        x: dragState.originX + dx,
        y: dragState.originY + dy,
      });
    });

    function endDrag(event) {
      if (!(event instanceof PointerEvent)) return;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      dragState = null;
      viewport.classList.remove("is-dragging");
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    }

    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);

    // Touch fallback for browsers/devices where PointerEvent drag is unreliable.
    var touchDrag = null;

    viewport.addEventListener("touchstart", function (event) {
      if (!(event instanceof TouchEvent)) return;
      if (event.touches.length !== 1) return;
      if (!shouldEnableGestureDrag(figure)) return;
      var target = event.target;
      if (target instanceof Element && target.closest(".mdsone-mermaid__controls")) return;

      var touch = event.touches[0];
      var pan = readPan(figure);
      touchDrag = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      viewport.classList.add("is-dragging");
      event.preventDefault();
    }, { passive: false });

    viewport.addEventListener("touchmove", function (event) {
      if (!(event instanceof TouchEvent)) return;
      if (!touchDrag) return;
      if (!shouldEnableGestureDrag(figure)) return;
      var touch = null;
      for (var i = 0; i < event.touches.length; i += 1) {
        if (event.touches[i].identifier === touchDrag.id) {
          touch = event.touches[i];
          break;
        }
      }
      if (!touch) return;
      var dx = touch.clientX - touchDrag.startX;
      var dy = touch.clientY - touchDrag.startY;
      writePan(figure, {
        x: touchDrag.originX + dx,
        y: touchDrag.originY + dy,
      });
      event.preventDefault();
    }, { passive: false });

    function endTouchDrag() {
      if (!touchDrag) return;
      touchDrag = null;
      viewport.classList.remove("is-dragging");
    }

    viewport.addEventListener("touchend", endTouchDrag, { passive: true });
    viewport.addEventListener("touchcancel", endTouchDrag, { passive: true });
  }

  function bindViewportWheelZoom(figure) {
    if (!(figure instanceof HTMLElement)) return;
    var viewport = getViewport(figure);
    if (!(viewport instanceof HTMLElement)) return;
    if (viewport.dataset.mermaidWheelBound === "1") return;
    viewport.dataset.mermaidWheelBound = "1";

    viewport.addEventListener("wheel", function (event) {
      if (!(event instanceof WheelEvent)) return;
      if (isTouchLikeDevice() && !isFigureFullscreen(figure)) return;
      var svg = figure.querySelector(".mdsone-mermaid__svg > svg");
      if (!(svg instanceof SVGElement)) return;

      // While cursor is inside Mermaid viewport, wheel controls zoom.
      event.preventDefault();
      var current = readScale(figure);
      var direction = event.deltaY < 0 ? 1 : -1;
      var factor = Math.min(3, Math.max(1, Math.abs(event.deltaY) / 100));
      var next = current + (direction * STEP * factor);
      writeScale(figure, svg, next);
    }, { passive: false });
  }

  function moveFigure(figure, direction) {
    if (!(figure instanceof HTMLElement)) return;
    var current = readPan(figure);
    if (direction === "home") {
      var svg = figure.querySelector(".mdsone-mermaid__svg > svg");
      if (svg instanceof SVGElement) {
        writeScale(figure, svg, 1);
      }
      writePan(figure, { x: 0, y: 0 });
      return;
    }

    var x = current.x;
    var y = current.y;
    if (direction === "up") y += PAN_STEP;
    else if (direction === "down") y -= PAN_STEP;
    else if (direction === "left") x += PAN_STEP;
    else if (direction === "right") x -= PAN_STEP;
    else return;

    writePan(figure, { x: x, y: y });
  }

  function bindFigure(figure) {
    if (!(figure instanceof HTMLElement)) return;
    if (figure.dataset.mermaidZoomBound === "1") return;
    var svg = figure.querySelector(".mdsone-mermaid__svg > svg");
    if (!(svg instanceof SVGElement)) return;
    var viewport = getViewport(figure);
    figure.dataset.mermaidZoomBound = "1";
    writeScale(figure, svg, readScale(figure));
    writePan(figure, readPan(figure));
    lockViewportSize(figure, viewport);
    bindViewportDrag(figure);
    bindViewportWheelZoom(figure);
    bindFullscreenState(figure);
  }

  function bindAll(root) {
    var target = root && root.querySelectorAll ? root : document;
    var figures = target.querySelectorAll(".mdsone-mermaid[data-mermaid-rendered='1']");
    figures.forEach(bindFigure);
  }

  function decodeMermaidSource(base64) {
    var helper = window.__mdsoneMermaidDecodeBase64Utf8;
    if (typeof helper !== "function") return "";
    return helper(base64);
  }

  function readMermaidSource(figure) {
    if (!(figure instanceof HTMLElement)) return "";
    return decodeMermaidSource(figure.getAttribute("data-mermaid-source-b64"));
  }

  function fallbackCopy(text) {
    try {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return !!ok;
    } catch (_e) {
      return false;
    }
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).catch(function () {
        if (fallbackCopy(text)) return;
        throw new Error("copy failed");
      });
    }

    if (fallbackCopy(text)) return Promise.resolve();
    return Promise.reject(new Error("copy failed"));
  }

  function flashCopyState(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    if (!button.dataset.defaultHtml) {
      button.dataset.defaultHtml = button.innerHTML;
    }
    button.innerHTML = ICON_CHECK;
    button.classList.add("copied");
    setTimeout(function () {
      button.innerHTML = button.dataset.defaultHtml || button.innerHTML;
      button.classList.remove("copied");
    }, 1800);
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var copyButton = target.closest(".mdsone-mermaid__copy-btn");
    if (copyButton instanceof HTMLButtonElement) {
      var copyFigure = copyButton.closest(".mdsone-mermaid");
      var source = readMermaidSource(copyFigure);
      if (!source) return;

      copyText(source).then(function () {
        flashCopyState(copyButton);
      }).catch(function () {
        // Keep silent on copy failure to match code-copy behavior.
      });
      return;
    }

    var button = target.closest(".mdsone-mermaid__zoom-btn");
    if (button) {
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
      return;
    }

    var fullscreenButton = target.closest(".mdsone-mermaid__fullscreen-btn");
    if (fullscreenButton) {
      var fullscreenFigure = fullscreenButton.closest(".mdsone-mermaid");
      if (!(fullscreenFigure instanceof HTMLElement)) return;
      toggleFigureFullscreen(fullscreenFigure);
      return;
    }

    var panButton = target.closest(".mdsone-mermaid__pan-btn");
    if (!panButton) return;
    var figureForPan = panButton.closest(".mdsone-mermaid");
    if (!(figureForPan instanceof HTMLElement)) return;
    var direction = String(panButton.getAttribute("data-pan") || "").toLowerCase();
    moveFigure(figureForPan, direction);
  });

  bindAll(document);
  window.__mdsoneMermaidZoomInit = function (root) {
    bindAll(root || document);
  };

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
