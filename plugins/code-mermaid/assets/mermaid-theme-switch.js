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

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
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
    htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
