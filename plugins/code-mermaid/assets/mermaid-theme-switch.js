;(function () {
  function decodeStyleText(raw) {
    if (!raw || raw.indexOf("&") === -1) return raw || "";
    return raw
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function detectThemeFromNode(node) {
    if (!node || !node.getAttribute) return null;
    var dataTheme = String(node.getAttribute("data-theme") || "").toLowerCase();
    if (dataTheme === "dark") return "dark";
    if (dataTheme === "light") return "light";

    var className = String(node.className || "").toLowerCase();
    if (/\bdark\b/.test(className)) return "dark";
    if (/\blight\b/.test(className)) return "light";
    return null;
  }

  function getTheme() {
    var htmlTheme = detectThemeFromNode(document.documentElement);
    if (htmlTheme) return htmlTheme;

    var bodyTheme = detectThemeFromNode(document.body);
    if (bodyTheme) return bodyTheme;

    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function applyFigureTheme(figure, theme) {
    const styleNode = figure.querySelector("svg style[data-mermaid-theme-style='1']");
    const lightNode = figure.querySelector("script.mdsone-mermaid-style-light");
    const darkNode = figure.querySelector("script.mdsone-mermaid-style-dark");
    if (!styleNode || !lightNode || !darkNode) return;

    const lightStyle = decodeStyleText(lightNode.textContent || "");
    const darkStyle = decodeStyleText(darkNode.textContent || "");
    const nextStyle = theme === "dark" ? (darkStyle || lightStyle) : (lightStyle || darkStyle);
    if (!nextStyle || styleNode.textContent === nextStyle) return;
    styleNode.textContent = nextStyle;
  }

  function applyTheme(root) {
    const theme = getTheme();
    const figures = root.querySelectorAll
      ? root.querySelectorAll(".mdsone-mermaid[data-mermaid-themed='1']")
      : [];
    figures.forEach(function (figure) {
      applyFigureTheme(figure, theme);
    });
  }

  function init() {
    applyTheme(document);

    if (typeof MutationObserver === "undefined") return;
    const htmlObserver = new MutationObserver(function (mutations) {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
          applyTheme(document);
          return;
        }
      }
    });
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    if (document.body) {
      htmlObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-theme", "class"],
      });
    }

    const bodyObserver = new MutationObserver(function (mutations) {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          const el = node;
          if (el.matches && el.matches(".mdsone-mermaid[data-mermaid-themed='1']")) {
            applyFigureTheme(el, getTheme());
            return;
          }
          applyTheme(el);
        });
      }
    });
    if (document.body) {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (window.matchMedia) {
      var media = window.matchMedia("(prefers-color-scheme: dark)");
      if (media && typeof media.addEventListener === "function") {
        media.addEventListener("change", function () {
          applyTheme(document);
        });
      } else if (media && typeof media.addListener === "function") {
        media.addListener(function () {
          applyTheme(document);
        });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
