// ============================================================
// plugins/copy/copy-button.ts — 複製按鈕前端邏輯
// 從 lib/copy/copy.js 遷移改寫為 TypeScript export
// ============================================================

/** 回傳複製按鈕的 IIFE JavaScript 字串（供注入至輸出 HTML） */
export function getCopyButtonScript(): string {
    return /* js */ `;(function () {
  var ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
  var ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'

  function fallbackCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    try { document.execCommand('copy') } catch (e) {}
    document.body.removeChild(ta)
  }

  window.__mdsone_copy = function (container) {
    container.querySelectorAll('pre').forEach(function (pre) {
      if (pre.querySelector('.copy-btn')) return
      var btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.setAttribute('aria-label', 'Copy code')
      btn.setAttribute('type', 'button')
      btn.innerHTML = ICON_COPY
      btn.addEventListener('click', function () {
        var codeEl = pre.querySelector('code')
        var text = codeEl ? codeEl.textContent : pre.textContent
        var onDone = function () {
          btn.innerHTML = ICON_CHECK
          btn.classList.add('copied')
          setTimeout(function () { btn.innerHTML = ICON_COPY; btn.classList.remove('copied') }, 2000)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(onDone).catch(function () { fallbackCopy(text); onDone() })
        } else {
          fallbackCopy(text); onDone()
        }
      })
      pre.appendChild(btn)
    })
  }
})()`;
}
