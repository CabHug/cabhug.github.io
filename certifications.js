/**
 * certifications.js — v1.0
 * Dynamic renderer for Hugo Cabrera's portfolio certifications view.
 *
 * Reads a single JSON file (certifications.json) with certifications
 * grouped/nested by category, and renders:
 *   - a hero header (same visual language as case-study.js)
 *   - a category filter bar (client-side filtering)
 *   - a responsive grid of certificate "boxes" with rounded corners,
 *     hover effect, and a button to open the certificate file
 *
 * Deep-linkable via ?category=<id> (read on load); filter buttons
 * update the URL via history.pushState without a full reload.
 *
 * Architecture (mirrors case-study.js):
 *   utils    → shared helpers
 *   i18n     → language detection & translation
 *   loader   → fetch certifications.json
 *   renderer → build every DOM section
 *   app      → orchestrate init, theme, language toggle, filtering
 */

/* ============================================================
   UTILS
   ============================================================ */
const utils = (() => {
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function setParam(name, value) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    history.pushState({}, '', url);
  }
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  return { getParam, setParam, setText };
})();


/* ============================================================
   I18N
   ============================================================ */
const i18n = (() => {
  let _lang = localStorage.getItem('lang') || 'es';

  function get()     { return _lang; }
  function set(lang) { _lang = lang; localStorage.setItem('lang', lang); }
  function toggle()  { set(_lang === 'es' ? 'en' : 'es'); }

  function pick(obj, key) {
    return obj[`${key}_${_lang}`] ?? obj[`${key}_es`] ?? '';
  }

  const UI = {
    loading:          { es: 'Cargando certificaciones…',        en: 'Loading certifications…'          },
    not_found_title:  { es: 'No se encontraron certificaciones', en: 'No certifications found'          },
    not_found_body:   { es: 'No hay certificados disponibles para esta categoría todavía.',
                        en: 'There are no certificates available for this category yet.'                },
    btn_back:         { es: 'Portafolio',                       en: 'Portfolio'                        },
    theme_light:      { es: 'Modo Oscuro',                      en: 'Dark Mode'                        },
    theme_dark:       { es: 'Modo Claro',                       en: 'Light Mode'                       },
    filter_all:       { es: 'Todas',                            en: 'All'                              },
    view_certificate: { es: 'Ver certificado',                  en: 'View certificate'                 },
    issuer_by:        { es: 'Emitido por',                      en: 'Issued by'                        },
  };

  function t(key) { return UI[key]?.[_lang] ?? UI[key]?.['es'] ?? key; }

  return { get, set, toggle, pick, t };
})();


/* ============================================================
   LOADER
   ============================================================ */
const loader = (() => {
  let _cache = null;
  async function fetchCertifications() {
    if (_cache) return _cache;
    try {
      const res = await fetch('certifications.json');
      if (!res.ok) return null;
      _cache = await res.json();
      return _cache;
    } catch {
      return null;
    }
  }
  return { fetchCertifications };
})();


/* ============================================================
   RENDERER
   ============================================================ */
const renderer = (() => {

  function buildBanner(src) {
    if (!src) return '';
    return `
      <div class="cs-banner cs-fade">
        <img src="${src}" alt="Certifications banner" loading="eager">
      </div>`;
  }

  function buildHero(meta) {
    const title   = i18n.pick(meta, 'title');
    const summary = i18n.pick(meta, 'summary');
    return `
      <div class="cs-hero cs-fade">
        <h1 class="cs-title">${title}</h1>
        <p class="cs-summary">${summary}</p>
        <div class="cf-filters" id="cf_filters"></div>
      </div>`;
  }

  function buildFilters(categories, activeId) {
    const allBtn = `
      <button type="button" class="cf-filter-btn${!activeId ? ' active' : ''}" data-cat="">
        <i class="fas fa-layer-group"></i>${i18n.t('filter_all')}
      </button>`;
    const catBtns = Object.entries(categories).map(([id, cat]) => `
      <button type="button" class="cf-filter-btn${activeId === id ? ' active' : ''}" data-cat="${id}">
        <i class="${cat.icon}"></i>${i18n.pick(cat, 'title')}
      </button>`).join('');
    return allBtn + catBtns;
  }

  function buildCard(item, categoryId) {
    const name   = i18n.pick(item, 'name');
    const desc   = i18n.pick(item, 'desc');
    const badges = (item.badges || []).map(b => `<span class="cf-card-badge">${b}</span>`).join('');
    return `
      <div class="cf-card cs-fade" data-category="${categoryId}">
        <div class="cf-card-head">
          <span class="cf-card-icon"><i class="fas fa-award" aria-hidden="true"></i></span>
        </div>
        <div>
          <div class="cf-card-name">${name}</div>
          <div class="cf-card-issuer"><i class="fas fa-building" aria-hidden="true"></i>${i18n.t('issuer_by')} ${item.issuer}${item.date ? ` · ${item.date}` : ''}</div>
        </div>
        ${desc ? `<p class="cf-card-desc">${desc}</p>` : ''}
        ${badges ? `<div class="cf-card-meta">${badges}</div>` : ''}
        <div class="cf-card-foot">
          <a href="${item.file}" target="_blank" rel="noopener" class="btn btn-primary">
            <i class="fas fa-external-link-alt" aria-hidden="true"></i> ${i18n.t('view_certificate')}
          </a>
        </div>
      </div>`;
  }

  function buildCategoryBlock(id, cat) {
    const items = cat.items || [];
    if (!items.length) return '';
    return `
      <div class="cf-category-block cs-fade">
        <h2 class="cf-category-title">
          <i class="${cat.icon}" aria-hidden="true"></i>
          ${i18n.pick(cat, 'title')}
          <span class="cf-category-count">${items.length}</span>
        </h2>
        <div class="cf-grid">
          ${items.map(it => buildCard(it, id)).join('')}
        </div>
      </div>`;
  }

  function buildEmpty() {
    return `
      <div class="cf-empty cs-fade">
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        <h2>${i18n.t('not_found_title')}</h2>
        <p>${i18n.t('not_found_body')}</p>
      </div>`;
  }

  function renderAll(data, activeId, rootEl) {
    const categories = data.categories || {};
    const blocksHtml = activeId
      ? buildCategoryBlock(activeId, categories[activeId] || { items: [] })
      : Object.entries(categories).map(([id, cat]) => buildCategoryBlock(id, cat)).join('');

    rootEl.innerHTML = `
      ${buildBanner(data.meta?.banner)}
      ${buildHero(data.meta || {})}
      <div id="cf_blocks">${blocksHtml || buildEmpty()}</div>`;

    const filtersEl = document.getElementById('cf_filters');
    if (filtersEl) filtersEl.innerHTML = buildFilters(categories, activeId);
  }

  return { renderAll };
})();


/* ============================================================
   APP  (init, theme, language, filtering)
   ============================================================ */
const app = (() => {
  let _theme = localStorage.getItem('theme') || 'light';
  let _data  = null;
  let _activeCategory = '';

  function applyTheme(theme) {
    _theme = theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const icon   = document.getElementById('themeIcon');
    const textEl = document.getElementById('themeText');
    const isDark = theme === 'dark';
    if (icon)   icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    if (textEl) textEl.textContent = isDark ? i18n.t('theme_dark') : i18n.t('theme_light');
  }

  function updateToolbar() {
    utils.setText('btn_back_text', i18n.t('btn_back'));
    utils.setText('langText', i18n.get() === 'es' ? 'EN' : 'ES');
  }

  function updateMeta() {
    if (!_data) return;
    const meta = _data.meta || {};
    document.title = `${i18n.pick(meta, 'title')} · Hugo Cabrera`;
    const metaDesc = document.getElementById('cf_meta_description');
    if (metaDesc) metaDesc.content = i18n.pick(meta, 'summary');
    document.documentElement.lang = i18n.get();
  }

  function render() {
    const root = document.getElementById('cf_root');
    if (!_data) return;
    renderer.renderAll(_data, _activeCategory, root);
    bindFilterClicks();
  }

  function bindFilterClicks() {
    document.querySelectorAll('.cf-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat') || '';
        _activeCategory = cat;
        utils.setParam('category', cat);
        render();
      });
    });
  }

  async function init() {
    applyTheme(_theme);
    updateToolbar();
    utils.setText('loading_text', i18n.t('loading'));

    _data = await loader.fetchCertifications();
    _activeCategory = utils.getParam('category') || '';

    const root = document.getElementById('cf_root');
    if (!_data) {
      root.innerHTML = '';
      root.appendChild(Object.assign(document.createElement('div'), { innerHTML: '' }));
      root.innerHTML = `<div class="cf-empty"><i class="fas fa-triangle-exclamation"></i><h2>${i18n.t('not_found_title')}</h2><p>${i18n.t('not_found_body')}</p></div>`;
      return;
    }

    updateMeta();
    render();
  }

  return { init, applyTheme, updateToolbar, updateMeta, render, get theme() { return _theme; } };
})();


/* ============================================================
   GLOBAL HANDLERS  (called from HTML attributes)
   ============================================================ */
function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'light';
  const next    = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  location.reload();
}

function toggleLanguage() {
  i18n.toggle();
  app.updateToolbar();
  app.updateMeta();
  app.render();
}

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => app.init());
