async function renderApp(data) {
        const isMultiLang = !!(data.locales && Array.isArray(data.locales) && data.locales.length > 0)
        if (!data || !data.config) {
          console.error("Invalid mdsone_DATA structure")
          return
        }

        const sidebar = document.querySelector(".sidebar")
        const menuBtn = document.getElementById("menu-btn")
        const mobileMenuBtn = document.getElementById("mobile-menu-btn")
        const tabList = document.getElementById("tab-list")
        const contentArea = document.getElementById("content-area")
        const htmlEl = document.documentElement
        const config = data.config
        const TOC_ENABLED = true
        const TOC_LEVELS = [2, 3]
        const SUN_ICON_SVG = '<svg viewBox="0 0 24 24" focusable="false"><use href="#icon-sun" xlink:href="#icon-sun"></use></svg>'
        const MOON_ICON_SVG = '<svg viewBox="0 0 24 24" focusable="false"><use href="#icon-moon" xlink:href="#icon-moon"></use></svg>'
        const GLOBE_ICON_SVG = '<svg viewBox="0 0 24 24" focusable="false"><use href="#icon-globe" xlink:href="#icon-globe"></use></svg>'

        const variantName = config.template_variant || "default"
        const variantKeyPalette = (
          variantName !== "default" &&
          config.types &&
          config.types[variantName]
        ) ? variantName : null
        const resolvedPalette = (
          config.palette ||
          variantKeyPalette ||
          (config.types && config.types.default && config.types.default.palette) ||
          "mist-blue"
        )
        htmlEl.setAttribute("data-palette", resolvedPalette)

        let activeI18n = isMultiLang
          ? (data.i18n[data.defaultLocale] || data.i18n[data.locales[0]] || {})
          : (data.i18n || {})
        let activeLocale = isMultiLang ? (data.defaultLocale || data.locales[0]) : null
        let langTrigger = null
        let langMenu = null

        function getLocaleNameKey(locale) {
          return `locale_name_${String(locale || "").replace(/-/g, "_")}`
        }

        function getLocaleNameFromConfig(locale) {
          const localeNames = data.localeNames || {}
          const raw = String(locale || "").trim()
          if (!raw) return ""
          const hyphen = raw.replace(/_/g, "-")
          const underscore = raw.replace(/-/g, "_")
          return localeNames[raw] || localeNames[hyphen] || localeNames[underscore] || ""
        }

        function getLocaleDisplayName(locale) {
          const fromConfig = getLocaleNameFromConfig(locale)
          if (fromConfig) return fromConfig

          const key = getLocaleNameKey(locale)
          const currentValue = activeI18n && typeof activeI18n[key] === "string"
            ? activeI18n[key].trim()
            : ""
          if (currentValue) return currentValue

          if (isMultiLang && data.i18n) {
            const enFallback = data.i18n.en || data.i18n["en-US"] || data.i18n["en-GB"]
            const enValue = enFallback && typeof enFallback[key] === "string"
              ? enFallback[key].trim()
              : ""
            if (enValue) return enValue
          }

          return locale
        }

        function refreshLocaleSwitcherLabels() {
          if (langTrigger && activeLocale) {
            const currentLocaleName = getLocaleDisplayName(activeLocale)
            const textEl = langTrigger.querySelector(".lang-trigger-text")
            if (textEl) textEl.textContent = currentLocaleName
            else langTrigger.textContent = currentLocaleName
            langTrigger.setAttribute("aria-label", currentLocaleName)
            langTrigger.title = currentLocaleName
          }
          if (langMenu) {
            langMenu.querySelectorAll(".lang-option").forEach((el) => {
              const locale = el.dataset.locale || ""
              el.textContent = getLocaleDisplayName(locale)
            })
          }
        }

        function closeSidebarOnMobile() {
          if (window.innerWidth <= 768 && sidebar.classList.contains("active")) {
            sidebar.classList.remove("active")
          }
        }

        function setActiveDoc(tab) {
          const buttons = tabList.querySelectorAll(".tab-button")
          const contents = contentArea.querySelectorAll(".tab-content")
          buttons.forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tab))
          contents.forEach((c) => c.classList.toggle("active", c.getAttribute("data-tab") === tab))
          window.scrollTo({ top: 0, behavior: "auto" })
          switchTOC(tab)
        }

        function buildTOC(tabName) {
          if (!TOC_ENABLED) return
          const nav = document.querySelector(`.toc-nav[data-tab="${tabName}"]`)
          if (!nav || nav.children.length > 0) return

          const content = document.querySelector(`.tab-content[data-tab="${tabName}"]`)
          if (!content) return

          const selector = TOC_LEVELS.map((l) => `h${l}`).join(",")
          const headings = content.querySelectorAll(selector)
          if (headings.length === 0) return

          let html = '<ul class="toc-list">'
          headings.forEach((h) => {
            const level = parseInt(h.tagName[1], 10)
            const id = h.id || ""
            const text = h.textContent || ""
            if (id) html += `<li class="toc-item toc-h${level}"><a href="#${id}" data-target-id="${id}">${text}</a></li>`
          })
          html += "</ul>"
          nav.innerHTML = html

          nav.querySelectorAll("a[data-target-id]").forEach((a) => {
            a.addEventListener("click", function (e) {
              e.preventDefault()
              const targetId = this.getAttribute("data-target-id")
              const activeContent = contentArea.querySelector(".tab-content.active")
              const target = activeContent ? activeContent.querySelector(`#${CSS.escape(targetId)}`) : null
              if (target) {
                const top = target.getBoundingClientRect().top + window.scrollY - 24
                window.scrollTo({ top, behavior: "smooth" })
              }
            })
          })
        }

        function switchTOC(activeTab) {
          document.querySelectorAll(".toc-nav").forEach((n) => n.classList.remove("open"))
          buildTOC(activeTab)
          const activeNav = document.querySelector(`.toc-nav[data-tab="${activeTab}"]`)
          if (activeNav && activeNav.children.length > 0) activeNav.classList.add("open")
        }

        function enhanceTables(root) {
          if (!root) return
          const tables = root.querySelectorAll("table")
          tables.forEach((table) => {
            if (!(table instanceof HTMLTableElement)) return

            const parent = table.parentElement
            if (!parent || !parent.classList.contains("table-scroll-wrapper")) {
              const wrapper = document.createElement("div")
              wrapper.className = "table-scroll-wrapper"
              table.parentNode.insertBefore(wrapper, table)
              wrapper.appendChild(table)
            }

            const headerRow = table.tHead?.rows?.[0] || table.querySelector("tr")
            const headers = headerRow
              ? Array.from(headerRow.cells).map((cell) => (cell.textContent || "").trim())
              : []

            const bodyRows = table.tBodies.length > 0
              ? Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows))
              : Array.from(table.rows).slice(headerRow ? 1 : 0)

            bodyRows.forEach((row) => {
              Array.from(row.cells).forEach((cell, idx) => {
                if (cell.tagName !== "TD") return
                const label = headers[idx] || `Column ${idx + 1}`
                cell.setAttribute("data-label", label)
              })
            })
          })
        }

        function renderDocs(docs, i18n) {
          tabList.innerHTML = ""
          contentArea.innerHTML = ""

          document.getElementById("sidebar-footer").textContent = i18n.footer_label || ""
          if (menuBtn) menuBtn.title = i18n.menu_open_title || ""
          if (themeBtn) themeBtn.title = i18n.theme_toggle_title || ""
          if (fontSizeBtn) fontSizeBtn.title = i18n.font_size_toggle_title || "Toggle font size"
          updateThemeUI()
          updateFontSizeUI()

          docs.forEach((doc) => {
            const btn = document.createElement("button")
            btn.className = "tab-button"
            btn.setAttribute("data-tab", doc.id)
            btn.innerHTML = `<span class="tab-label">${doc.title}</span><span class="tab-indicator"></span>`
            tabList.appendChild(btn)

            const nav = document.createElement("nav")
            nav.className = "toc-nav"
            nav.setAttribute("data-tab", doc.id)
            tabList.appendChild(nav)

            const content = document.createElement("div")
            content.className = "tab-content"
            content.setAttribute("data-tab", doc.id)
            content.innerHTML = doc.html
            enhanceTables(content)
            contentArea.appendChild(content)
          })

          const buttons = tabList.querySelectorAll(".tab-button")

          buttons.forEach((btn) => {
            btn.addEventListener("click", function () {
              const tab = this.getAttribute("data-tab")
              const isAlreadyActive = this.classList.contains("active")

              if (isAlreadyActive) {
                const nav = document.querySelector(`.toc-nav[data-tab="${tab}"]`)
                if (nav && nav.children.length > 0) nav.classList.toggle("open")
                return
              }

              setActiveDoc(tab)
              closeSidebarOnMobile()
            })
          })

          if (docs.length > 0) setActiveDoc(docs[0].id)
        }

        function switchLocale(locale) {
          activeLocale = locale
          activeI18n = data.i18n[locale] || {}
          localStorage.setItem("mdsone_locale", locale)
          htmlEl.lang = activeI18n.html_lang || locale
          refreshLocaleSwitcherLabels()
          if (langMenu) {
            langMenu.querySelectorAll(".lang-option").forEach((el) => {
              el.classList.toggle("active", el.dataset.locale === locale)
            })
          }
          renderDocs(data.docs[locale] || [], activeI18n)
        }

        if (isMultiLang) {
          const savedLocale = localStorage.getItem("mdsone_locale")
          if (savedLocale && data.locales.includes(savedLocale)) {
            activeLocale = savedLocale
            activeI18n = data.i18n[activeLocale] || {}
          }
          const switcher = document.getElementById("lang-switcher")
          if (switcher) {
            switcher.style.display = "flex"

            langTrigger = document.createElement("button")
            langTrigger.type = "button"
            langTrigger.className = "lang-trigger"
            langTrigger.id = "lang-trigger"
            langTrigger.innerHTML = `<span class="lang-trigger-icon" aria-hidden="true">${GLOBE_ICON_SVG}</span><span class="lang-trigger-text"></span>`

            langMenu = document.createElement("div")
            langMenu.className = "lang-menu"
            langMenu.id = "lang-menu"

            data.locales.forEach((locale) => {
              const item = document.createElement("button")
              item.type = "button"
              item.className = "lang-option" + (locale === activeLocale ? " active" : "")
              item.dataset.locale = locale
              item.textContent = getLocaleDisplayName(locale)
              item.addEventListener("click", () => {
                switchLocale(locale)
                switcher.classList.remove("open")
              })
              langMenu.appendChild(item)
            })

            const initialLocaleName = getLocaleDisplayName(activeLocale)
            const triggerText = langTrigger.querySelector(".lang-trigger-text")
            if (triggerText) triggerText.textContent = initialLocaleName
            langTrigger.setAttribute("aria-label", initialLocaleName)
            langTrigger.title = initialLocaleName
            langTrigger.addEventListener("click", (e) => {
              e.stopPropagation()
              switcher.classList.toggle("open")
            })

            switcher.appendChild(langTrigger)
            switcher.appendChild(langMenu)

            document.addEventListener("click", (e) => {
              if (!switcher.contains(e.target)) switcher.classList.remove("open")
            })
            document.addEventListener("keydown", (e) => {
              if (e.key === "Escape") switcher.classList.remove("open")
            })
          }
        }

        if (menuBtn) {
          menuBtn.addEventListener("click", () => {
            sidebar.classList.toggle("active")
          })
        }

        if (mobileMenuBtn) {
          mobileMenuBtn.addEventListener("click", () => {
            sidebar.classList.toggle("active")
          })
        }

        contentArea.addEventListener("click", () => {
          closeSidebarOnMobile()
        })

        const themeBtn = document.getElementById("theme-toggle")
        const themeIcon = document.getElementById("theme-icon")
        const fontSizeBtn = document.getElementById("font-size-toggle")
        const fontSizeLabel = document.getElementById("font-size-label")
        const FONT_SIZE_STORAGE_KEY = "mdsone_font_size"
        const FONT_SIZE_MODES = ["sm", "md", "lg"]
        let isDark = config.theme_mode === "dark"
        let fontSizeMode = normalizeFontSizeMode(localStorage.getItem(FONT_SIZE_STORAGE_KEY) || "sm")

        function normalizeFontSizeMode(mode) {
          const v = String(mode || "").toLowerCase()
          return FONT_SIZE_MODES.includes(v) ? v : "sm"
        }

        function getFontSizeLabel(mode) {
          if (mode === "sm") return activeI18n.font_size_small_label || "A"
          if (mode === "lg") return activeI18n.font_size_large_label || "A++"
          return activeI18n.font_size_medium_label || "A+"
        }

        function updateFontSizeUI() {
          htmlEl.setAttribute("data-font-size", fontSizeMode)
          if (fontSizeLabel) fontSizeLabel.textContent = getFontSizeLabel(fontSizeMode)
          if (fontSizeBtn) fontSizeBtn.title = activeI18n.font_size_toggle_title || "Toggle font size"
        }

        function cycleFontSizeMode() {
          const idx = FONT_SIZE_MODES.indexOf(fontSizeMode)
          const nextIdx = (idx + 1) % FONT_SIZE_MODES.length
          fontSizeMode = FONT_SIZE_MODES[nextIdx]
          localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSizeMode)
          updateFontSizeUI()
        }

        function updateThemeUI() {
          if (isDark) {
            htmlEl.setAttribute("data-theme", "dark")
            if (themeIcon) themeIcon.innerHTML = MOON_ICON_SVG
          } else {
            htmlEl.setAttribute("data-theme", "light")
            if (themeIcon) themeIcon.innerHTML = SUN_ICON_SVG
          }
          const variantName = config.template_variant || "default"
          const variantKeyPalette = (
            variantName !== "default" &&
            config.types &&
            config.types[variantName]
          ) ? variantName : null
          const currentPalette = (
            config.palette ||
            variantKeyPalette ||
            (config.types && config.types.default && config.types.default.palette) ||
            "mist-blue"
          )
          htmlEl.setAttribute("data-palette", currentPalette)
        }
        updateThemeUI()
        updateFontSizeUI()

        themeBtn.addEventListener("click", () => {
          isDark = !isDark
          updateThemeUI()
        })
        if (fontSizeBtn) {
          fontSizeBtn.addEventListener("click", cycleFontSizeMode)
        }

        if (isMultiLang) {
          renderDocs(data.docs[activeLocale] || [], activeI18n)
        } else {
          renderDocs(data.docs || [], data.i18n || {})
        }
      }

      function loadInitialData() {
        const payloadEl = document.getElementById("mdsone-data")
        if (payloadEl && payloadEl.textContent) {
          try {
            return JSON.parse(payloadEl.textContent)
          } catch (e) {
            console.error("Failed to parse mdsone data payload", e)
          }
        }
        return null
      }

      const initialData = loadInitialData()
      if (initialData) {
        renderApp(initialData)
      }