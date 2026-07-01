/**
 * case-study.js  — v2.0
 * Dynamic renderer for Hugo Cabrera's portfolio case studies.
 *
 * Supports TWO JSON formats:
 *   • Legacy flat format  (title_es, business_context_es, challenges_es[], …)
 *   • Sections format     (sections[], hero{}, highlights[], metadata{}, references[])
 *
 * New section types in sections[] format:
 *   "text"     — prose block
 *   "list"     — bullet list
 *   "mermaid"  — Mermaid diagram
 *   "gallery"  — image gallery with collapsible accordion (first image always visible)
 *   "metrics"  — big-number highlight cards
 *
 * Architecture:
 *   utils        → shared helpers
 *   i18n         → language detection & translation
 *   loader       → fetch JSON from /case-studies/
 *   mermaidUtil  → Mermaid initialisation & rendering
 *   renderer     → build every DOM section
 *   app          → orchestrate init, theme, language toggle
 */

/* ============================================================
   UTILS
   ============================================================ */
const utils = (() => {
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function el(tag, className, innerHTML) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (innerHTML !== undefined) node.innerHTML = innerHTML;
    return node;
  }
  return { getParam, setHTML, setText, el };
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
    loading:          { es: 'Cargando caso de estudio…',      en: 'Loading case study…'         },
    not_found_title:  { es: 'Caso de Estudio No Encontrado',  en: 'Case Study Not Found'         },
    not_found_body:   { es: 'El caso de estudio solicitado no existe o fue eliminado.',
                        en: 'The requested case study does not exist or has been removed.'        },
    btn_back:         { es: 'Portafolio',                     en: 'Portfolio'                    },
    btn_back_bottom:  { es: '← Volver al Portafolio',        en: '← Back to Portfolio'          },
    sec_context:      { es: 'Contexto de Negocio',            en: 'Business Context'             },
    sec_problem:      { es: 'El Problema',                    en: 'The Problem'                  },
    sec_solution:     { es: 'La Solución',                    en: 'The Solution'                 },
    sec_architecture: { es: 'Arquitectura',                   en: 'Architecture'                 },
    sec_challenges:   { es: 'Desafíos',                       en: 'Challenges'                   },
    sec_results:      { es: 'Resultados',                     en: 'Results'                      },
    sec_lessons:      { es: 'Lecciones Aprendidas',           en: 'Lessons Learned'              },
    sec_technologies: { es: 'Tecnologías',                    en: 'Technologies'                 },
    sec_impact:       { es: 'Impacto',                        en: 'Impact'                       },
    sec_references:   { es: 'Referencias',                    en: 'References'                   },
    theme_light:      { es: 'Modo Oscuro',                    en: 'Dark Mode'                    },
    theme_dark:       { es: 'Modo Claro',                     en: 'Light Mode'                   },
    gallery_show:     { es: 'Ver más imágenes',               en: 'Show more images'             },
    gallery_hide:     { es: 'Ocultar imágenes',               en: 'Hide images'                  },
    gallery_of:       { es: 'de',                             en: 'of'                           },
  };

  function t(key) { return UI[key]?.[_lang] ?? UI[key]?.['es'] ?? key; }

  return { get, set, toggle, pick, t };
})();


/* ============================================================
   LOADER
   ============================================================ */
const loader = (() => {
  async function fetchCaseStudy(id) {
    if (!id || !/^[\w-]+$/.test(id)) return null;
    const url = `case-studies/${encodeURIComponent(id)}.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  return { fetchCaseStudy };
})();


/* ============================================================
   MERMAID UTIL
   ============================================================ */
const mermaidUtil = (() => {
  let _initialised = false;

  function init(theme) {
    if (_initialised) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    });
    _initialised = true;
  }

  async function render(containerEl, diagramSource) {
    if (!diagramSource) return;
    const id = 'mermaid-' + Date.now();
    try {
      const { svg } = await mermaid.render(id, diagramSource);
      containerEl.innerHTML = svg;
    } catch (err) {
      containerEl.innerHTML =
        `<p style="color:var(--text-muted);font-size:.82rem;">
          <i class="fas fa-triangle-exclamation"></i> Unable to render diagram.
        </p>`;
      console.warn('[case-study] Mermaid render error:', err);
    }
  }

  return { init, render };
})();


/* ============================================================
   RENDERER
   ============================================================ */
const renderer = (() => {

  /* ── shared helpers ── */
  function sectionTitleHTML(iconClass, text) {
    return `<h2 class="section-title">
      <i class="${iconClass}" aria-hidden="true"></i>${text}
    </h2>`;
  }

  function card(content, extraClass) {
    const d = document.createElement('div');
    d.className = `cs-section cs-fade${extraClass ? ' ' + extraClass : ''}`;
    d.innerHTML = content;
    return d;
  }

  /* ── banner image ── */
  function buildBanner(src) {
    if (!src) return null;
    const wrap = document.createElement('div');
    wrap.className = 'cs-banner cs-fade';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Case study banner';
    img.loading = 'eager';
    wrap.appendChild(img);
    return wrap;
  }

  /* ── hero (title, company, summary) ── */
  function buildHero(data) {
    // Supports both formats
    const heroData   = data.hero ?? data;
    const title      = i18n.pick(heroData, 'title');
    const summary    = i18n.pick(heroData, 'summary');
    const company    = data.metadata?.company ?? data.company ?? '';
    const category   = data.metadata?.category ?? '';
    const duration   = data.metadata?.duration ?? '';

    const d = document.createElement('div');
    d.className = 'cs-hero cs-fade';
    d.innerHTML = `
      <div class="cs-hero-meta">
        <div class="cs-company-tag">
          <i class="fas fa-building" aria-hidden="true"></i>
          ${company}
        </div>
        ${category ? `<span class="cs-meta-pill"><i class="fas fa-tag" aria-hidden="true"></i>${category}</span>` : ''}
        ${duration ? `<span class="cs-meta-pill"><i class="fas fa-clock" aria-hidden="true"></i>${duration}</span>` : ''}
      </div>
      <h1 class="cs-title">${title}</h1>
      <p class="cs-summary">${summary}</p>
    `;
    return d;
  }

  /* ── highlights / big-number metrics ── */
  function buildHighlights(items) {
    if (!items || !items.length) return null;
    const cards = items.map(h => `
      <div class="cs-highlight-card">
        <span class="cs-highlight-value">${h.value}</span>
        <span class="cs-highlight-label">${i18n.pick(h, 'label')}</span>
      </div>
    `).join('');
    const wrap = document.createElement('div');
    wrap.className = 'cs-highlights cs-fade';
    wrap.innerHTML = cards;
    return wrap;
  }

  /* ── plain text section ── */
  function buildTextSection(iconClass, titleText, bodyText) {
    if (!bodyText) return null;
    return card(`
      ${sectionTitleHTML(iconClass, titleText)}
      <p class="cs-body-text">${bodyText}</p>
    `);
  }

  /* ── bullet list section ── */
  function buildListSection(iconClass, titleText, items, bulletIconClass) {
    if (!items || !items.length) return null;
    const lis = items.map(item =>
      `<li>
        <i class="${bulletIconClass} cs-list-icon" aria-hidden="true"></i>
        <span>${item}</span>
      </li>`
    ).join('');
    return card(`
      ${sectionTitleHTML(iconClass, titleText)}
      <ul class="cs-list">${lis}</ul>
    `);
  }

  /* ── architecture / mermaid ── */
  async function buildArchitectureSection(iconClass, titleText, diagramSource, descriptionText) {
    const wrap = card(sectionTitleHTML(iconClass, titleText));
    const diagramWrap = document.createElement('div');
    diagramWrap.className = 'cs-mermaid-wrapper';

    if (diagramSource) {
      const mermaidEl = document.createElement('div');
      mermaidEl.className = 'mermaid';
      diagramWrap.appendChild(mermaidEl);
      wrap.appendChild(diagramWrap);
      await mermaidUtil.render(mermaidEl, diagramSource);
    } else if (descriptionText) {
      diagramWrap.innerHTML = `<p class="cs-body-text">${descriptionText}</p>`;
      wrap.appendChild(diagramWrap);
    }
    return wrap;
  }

  /* ── gallery section (accordion) ── */
  /*
   * Visibility logic:
   *   • The grid CSS sets auto-fill columns with minmax(240px, 1fr).
   *   • We calculate how many cards fit in one "row" based on the container
   *     width at render time, then keep that many visible and collapse the rest.
   *   • Minimum visible = 2 cards (never show just one).
   *   • If all cards fit in one row, no toggle button is shown.
   *   • Clicking anywhere on a card (not just the image) opens the lightbox.
   *   • Inside the lightbox, ← → keys and arrow buttons navigate between images.
   */
  function buildGallerySection(iconClass, titleText, descriptionText, items) {
    if (!items || !items.length) return null;

    const CARD_MIN_WIDTH = 240; // must match CSS minmax value
    const GAP            = 16;  // 1rem gap

    const sectionEl = document.createElement('div');
    sectionEl.className = 'cs-section cs-fade';
    sectionEl.innerHTML = sectionTitleHTML(iconClass, titleText);

    if (descriptionText) {
      const desc = document.createElement('p');
      desc.className = 'cs-body-text cs-gallery-desc';
      desc.textContent = descriptionText;
      sectionEl.appendChild(desc);
    }

    const galleryEl = document.createElement('div');
    galleryEl.className = 'cs-gallery';
    const uniqueId = 'gallery-' + Math.random().toString(36).slice(2, 8);
    galleryEl.id = uniqueId;

    // Build all figure elements
    const figures = items.map((item, idx) => {
      const imgTitle   = i18n.pick(item, 'title');
      const imgCaption = i18n.pick(item, 'caption');

      const figure = document.createElement('figure');
      figure.className = 'cs-gallery-item';
      figure.dataset.idx = idx;
      figure.setAttribute('role', 'button');
      figure.setAttribute('tabindex', '0');
      figure.setAttribute('aria-label', imgTitle || `Imagen ${idx + 1}`);

      figure.innerHTML = `
        <div class="cs-gallery-img-wrap">
          <img
            src="${item.image}"
            alt="${imgTitle || ''}"
            loading="${idx === 0 ? 'eager' : 'lazy'}"
            class="cs-gallery-img"
          >
          <div class="cs-gallery-overlay">
            <i class="fas fa-expand" aria-hidden="true"></i>
          </div>
        </div>
        ${imgTitle ? `<figcaption class="cs-gallery-caption">
          <strong>${imgTitle}</strong>
          ${imgCaption ? `<span>${imgCaption}</span>` : ''}
        </figcaption>` : ''}
        <span class="cs-gallery-counter">${idx + 1} ${i18n.t('gallery_of')} ${items.length}</span>
      `;

      // Click anywhere on the card → open lightbox
      const openThis = () => openLightbox(items, idx);
      figure.addEventListener('click', openThis);
      figure.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openThis(); }
      });

      galleryEl.appendChild(figure);
      return figure;
    });

    sectionEl.appendChild(galleryEl);

    // ── Calculate how many cards fit in one row ──
    // We defer this until after the element is in the DOM (requestAnimationFrame),
    // but we also compute a best-guess immediately using the container's likely width.
    function applyVisibility() {
      const containerWidth = galleryEl.offsetWidth || 860;
      const cols = Math.max(1, Math.floor((containerWidth + GAP) / (CARD_MIN_WIDTH + GAP)));
      // Show at least 2 cards, at most one full row
      const visibleCount = Math.max(2, Math.min(cols, items.length));
      const hiddenCount  = items.length - visibleCount;

      figures.forEach((fig, idx) => {
        if (idx < visibleCount) {
          fig.classList.remove('cs-gallery-extra');
          fig.classList.add('cs-gallery-first');
        } else {
          fig.classList.add('cs-gallery-extra');
          fig.classList.remove('cs-gallery-first');
          fig.classList.remove('cs-gallery-extra-visible');
        }
      });

      // Remove any old toggle button before (re)adding
      const old = sectionEl.querySelector('.cs-gallery-toggle');
      if (old) old.remove();

      if (hiddenCount > 0) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'cs-gallery-toggle btn';
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-controls', uniqueId);
        toggleBtn.innerHTML = `
          <i class="fas fa-images" aria-hidden="true"></i>
          <span>${i18n.t('gallery_show')} (${hiddenCount})</span>
          <i class="fas fa-chevron-down cs-toggle-chevron" aria-hidden="true"></i>
        `;

        let open = false;
        toggleBtn.addEventListener('click', () => {
          open = !open;
          toggleBtn.setAttribute('aria-expanded', String(open));
          figures.forEach((fig, idx) => {
            if (idx >= visibleCount) {
              fig.classList.toggle('cs-gallery-extra-visible', open);
            }
          });
          const spanEl = toggleBtn.querySelector('span');
          const chevEl = toggleBtn.querySelector('.cs-toggle-chevron');
          spanEl.textContent = open
            ? i18n.t('gallery_hide')
            : `${i18n.t('gallery_show')} (${hiddenCount})`;
          chevEl.style.transform = open ? 'rotate(180deg)' : '';
        });

        sectionEl.appendChild(toggleBtn);
      }
    }

    // Run once immediately (works if widths are available), then again after paint
    requestAnimationFrame(() => applyVisibility());

    return sectionEl;
  }

  /* ── metrics section (big numbers) ── */
  function buildMetricsSection(iconClass, titleText, items) {
    if (!items || !items.length) return null;
    const cards = items.map(m => `
      <div class="cs-metric-card">
        <span class="cs-metric-value">${m.value}</span>
        <span class="cs-metric-label">${i18n.pick(m, 'label')}</span>
      </div>
    `).join('');
    return card(`
      ${sectionTitleHTML(iconClass, titleText)}
      <div class="cs-metrics-grid">${cards}</div>
    `);
  }

  /* ── technologies (badges) ── */
  function buildTechnologies(techs) {
    if (!techs || !techs.length) return null;
    const badges = techs.map(t => `<span class="cs-badge">${t}</span>`).join('');
    return card(`
      ${sectionTitleHTML('fas fa-microchip', i18n.t('sec_technologies'))}
      <div class="cs-badges">${badges}</div>
    `);
  }

  /* ── references ── */
  function buildReferences(refs) {
    if (!refs || !refs.length) return null;
    const links = refs.map(r => `
      <li>
        <i class="fas fa-link cs-list-icon" aria-hidden="true"></i>
        <a href="${r.url}" target="_blank" rel="noopener noreferrer" class="cs-ref-link">
          ${r.name} <i class="fas fa-arrow-up-right-from-square" style="font-size:.7rem;"></i>
        </a>
      </li>
    `).join('');
    return card(`
      ${sectionTitleHTML('fas fa-book-open', i18n.t('sec_references'))}
      <ul class="cs-list">${links}</ul>
    `);
  }

  /* ── lightbox (with prev / next navigation) ── */
  let _lbItems   = [];   // current gallery items array
  let _lbCurrent = 0;    // current index

  function ensureLightbox() {
    let lb = document.getElementById('cs-lightbox');
    if (lb) return lb;

    lb = document.createElement('div');
    lb.id = 'cs-lightbox';
    lb.className = 'cs-lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Vista ampliada de imagen');
    lb.innerHTML = `
      <div class="cs-lightbox-backdrop"></div>
      <div class="cs-lightbox-inner">
        <button class="cs-lightbox-close" aria-label="Cerrar">
          <i class="fas fa-xmark"></i>
        </button>
        <div class="cs-lightbox-nav">
          <button class="cs-lightbox-prev" aria-label="Imagen anterior">
            <i class="fas fa-chevron-left"></i>
          </button>
          <img class="cs-lightbox-img" src="" alt="">
          <button class="cs-lightbox-next" aria-label="Imagen siguiente">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="cs-lightbox-info">
          <strong class="cs-lightbox-title"></strong>
          <span class="cs-lightbox-caption"></span>
          <span class="cs-lightbox-dots"></span>
        </div>
      </div>
    `;

    document.body.appendChild(lb);

    lb.querySelector('.cs-lightbox-backdrop').addEventListener('click', closeLightbox);
    lb.querySelector('.cs-lightbox-close').addEventListener('click', closeLightbox);
    lb.querySelector('.cs-lightbox-prev').addEventListener('click', e => {
      e.stopPropagation();
      lbNavigate(-1);
    });
    lb.querySelector('.cs-lightbox-next').addEventListener('click', e => {
      e.stopPropagation();
      lbNavigate(1);
    });

    document.addEventListener('keydown', e => {
      const isOpen = document.getElementById('cs-lightbox')?.classList.contains('cs-lightbox-open');
      if (!isOpen) return;
      if (e.key === 'Escape')     closeLightbox();
      if (e.key === 'ArrowLeft')  lbNavigate(-1);
      if (e.key === 'ArrowRight') lbNavigate(1);
    });

    return lb;
  }

  function lbNavigate(dir) {
    if (!_lbItems.length) return;
    _lbCurrent = (_lbCurrent + dir + _lbItems.length) % _lbItems.length;
    lbRender();
  }

  function lbRender() {
    const lb    = document.getElementById('cs-lightbox');
    if (!lb) return;
    const item  = _lbItems[_lbCurrent];
    if (!item) return;

    const imgEl     = lb.querySelector('.cs-lightbox-img');
    const titleEl   = lb.querySelector('.cs-lightbox-title');
    const captionEl = lb.querySelector('.cs-lightbox-caption');
    const dotsEl    = lb.querySelector('.cs-lightbox-dots');
    const prevBtn   = lb.querySelector('.cs-lightbox-prev');
    const nextBtn   = lb.querySelector('.cs-lightbox-next');

    // Fade transition
    imgEl.style.opacity = '0';
    imgEl.src = item.image;
    imgEl.alt = i18n.pick(item, 'title') || '';
    imgEl.onload = () => { imgEl.style.opacity = '1'; };

    titleEl.textContent   = i18n.pick(item, 'title')   || '';
    captionEl.textContent = i18n.pick(item, 'caption') || '';

    // Dot indicators
    if (_lbItems.length > 1) {
      dotsEl.innerHTML = _lbItems.map((_, i) =>
        `<span class="cs-lb-dot${i === _lbCurrent ? ' cs-lb-dot-active' : ''}"></span>`
      ).join('');
    } else {
      dotsEl.innerHTML = '';
    }

    // Show/hide nav arrows
    const single = _lbItems.length <= 1;
    prevBtn.style.visibility = single ? 'hidden' : '';
    nextBtn.style.visibility = single ? 'hidden' : '';
  }

  function openLightbox(items, startIdx) {
    // Accept either (items[], idx) or legacy (src, title, caption) for back-compat
    if (typeof items === 'string') {
      _lbItems   = [{ image: items, title_es: startIdx, caption_es: arguments[2] }];
      _lbCurrent = 0;
    } else {
      _lbItems   = items;
      _lbCurrent = startIdx ?? 0;
    }

    const lb = ensureLightbox();
    lbRender();
    lb.classList.add('cs-lightbox-open');
    document.body.style.overflow = 'hidden';
    lb.querySelector('.cs-lightbox-close').focus();
  }

  function closeLightbox() {
    const lb = document.getElementById('cs-lightbox');
    if (lb) lb.classList.remove('cs-lightbox-open');
    document.body.style.overflow = '';
  }

  /* ── back to portfolio CTA ── */
  function buildBackCTA() {
    const d = document.createElement('div');
    d.className = 'cs-cta-bottom cs-fade';
    d.innerHTML = `
      <a href="index.html" class="btn btn-primary">
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        ${i18n.t('btn_back_bottom')}
      </a>
    `;
    return d;
  }

  /* ── not found ── */
  function buildNotFound() {
    const d = document.createElement('div');
    d.className = 'cs-not-found cs-fade';
    d.innerHTML = `
      <div class="cs-not-found-icon">
        <i class="fas fa-file-circle-xmark" aria-hidden="true"></i>
      </div>
      <h1>${i18n.t('not_found_title')}</h1>
      <p>${i18n.t('not_found_body')}</p>
      <a href="index.html" class="btn btn-primary">
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        ${i18n.t('btn_back_bottom')}
      </a>
    `;
    return d;
  }

  /* ── icon map for known section ids ── */
  const SECTION_ICONS = {
    'business-context': 'fas fa-briefcase',
    'problem':          'fas fa-magnifying-glass',
    'solution':         'fas fa-lightbulb',
    'architecture':     'fas fa-diagram-project',
    'implementation':   'fas fa-code',
    'challenges':       'fas fa-triangle-exclamation',
    'results':          'fas fa-chart-line',
    'results-list':     'fas fa-chart-line',
    'lessons':          'fas fa-graduation-cap',
    'metrics':          'fas fa-bolt',
    'gallery':          'fas fa-images',
  };

  function iconFor(sec) {
    return SECTION_ICONS[sec.id] ?? SECTION_ICONS[sec.type] ?? 'fas fa-circle-dot';
  }

  /* ══════════════════════════════════════════════════════════
     RENDER ORCHESTRATOR — supports both JSON formats
     ══════════════════════════════════════════════════════════ */
  async function renderCaseStudy(data, rootEl) {
    rootEl.innerHTML = '';

    const lang = i18n.get();

    /* ─── detect which format we have ─── */
    const hasNewFormat = Array.isArray(data.sections);

    if (hasNewFormat) {
      await renderNewFormat(data, rootEl, lang);
    } else {
      await renderLegacyFormat(data, rootEl, lang);
    }
  }

  /* ─── NEW format renderer (sections[]) ─── */
  async function renderNewFormat(data, rootEl, lang) {
    // Banner (hero.cover)
    const bannerSrc = data.hero?.cover ?? data.banner;
    const banner = buildBanner(bannerSrc);
    if (banner) rootEl.appendChild(banner);

    // Hero
    rootEl.appendChild(buildHero(data));

    // Highlights strip (if present)
    const hlEl = buildHighlights(data.highlights);
    if (hlEl) rootEl.appendChild(hlEl);

    // Sections
    for (const sec of data.sections) {
      const icon = iconFor(sec);
      const title = i18n.pick(sec, 'title') || sec.title_en || '';

      let el = null;

      switch (sec.type) {
        case 'text': {
          const body = i18n.pick(sec, 'content');
          el = buildTextSection(icon, title, body);
          break;
        }
        case 'list': {
          const items = sec[`items_${lang}`] ?? sec['items_es'] ?? [];
          // use circle-check for results, minus for challenges
          const bulletIcon = (sec.id === 'results-list' || sec.id === 'results')
            ? 'fas fa-check'
            : 'fas fa-minus';
          el = buildListSection(icon, title, items, bulletIcon);
          break;
        }
        case 'mermaid': {
          el = await buildArchitectureSection(icon, title, sec.diagram, null);
          break;
        }
        case 'gallery': {
          const desc  = i18n.pick(sec, 'description');
          const items = sec.items ?? [];
          el = buildGallerySection(icon, title, desc, items);
          break;
        }
        case 'metrics': {
          el = buildMetricsSection(icon, title, sec.items);
          break;
        }
        default:
          break;
      }

      if (el) rootEl.appendChild(el);
    }

    // Technologies
    const techEl = buildTechnologies(data.technologies);
    if (techEl) rootEl.appendChild(techEl);

    // References
    const refsEl = buildReferences(data.references);
    if (refsEl) rootEl.appendChild(refsEl);

    rootEl.appendChild(buildBackCTA());
  }

  /* ─── LEGACY format renderer (flat fields) ─── */
  async function renderLegacyFormat(data, rootEl, lang) {
    const context    = i18n.pick(data, 'business_context');
    const problem    = i18n.pick(data, 'problem');
    const solution   = i18n.pick(data, 'solution');
    const lessons    = i18n.pick(data, 'lessons');
    const challenges = data[`challenges_${lang}`] ?? data['challenges_es'] ?? [];
    const results    = data[`results_${lang}`]    ?? data['results_es']    ?? [];

    // Banner
    const banner = buildBanner(data.banner);
    if (banner) rootEl.appendChild(banner);

    // Hero
    rootEl.appendChild(buildHero(data));

    // Business Context
    const ctxEl = buildTextSection('fas fa-briefcase', i18n.t('sec_context'), context);
    if (ctxEl) rootEl.appendChild(ctxEl);

    // Problem
    const probEl = buildTextSection('fas fa-magnifying-glass', i18n.t('sec_problem'), problem);
    if (probEl) rootEl.appendChild(probEl);

    // Solution
    const solEl = buildTextSection('fas fa-lightbulb', i18n.t('sec_solution'), solution);
    if (solEl) rootEl.appendChild(solEl);

    // Architecture
    if (data.architecture) {
      const archEl = await buildArchitectureSection(
        'fas fa-diagram-project',
        i18n.t('sec_architecture'),
        data.architecture.type === 'mermaid' ? data.architecture.diagram : null,
        data.architecture.description ?? null
      );
      if (archEl) rootEl.appendChild(archEl);
    }

    // Challenges
    const chalEl = buildListSection(
      'fas fa-triangle-exclamation', i18n.t('sec_challenges'),
      challenges, 'fas fa-minus'
    );
    if (chalEl) rootEl.appendChild(chalEl);

    // Results
    const resEl = buildListSection(
      'fas fa-chart-line', i18n.t('sec_results'),
      results, 'fas fa-check'
    );
    if (resEl) rootEl.appendChild(resEl);

    // Lessons
    const lesEl = buildTextSection('fas fa-graduation-cap', i18n.t('sec_lessons'), lessons);
    if (lesEl) rootEl.appendChild(lesEl);

    // Technologies
    const techEl = buildTechnologies(data.technologies);
    if (techEl) rootEl.appendChild(techEl);

    rootEl.appendChild(buildBackCTA());
  }

  return { renderCaseStudy, buildNotFound };
})();


/* ============================================================
   APP  (init, theme, language)
   ============================================================ */
const app = (() => {
  let _theme = localStorage.getItem('theme') || 'light';
  let _data  = null;

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

  async function rerender() {
    updateToolbar();
    applyTheme(_theme);
    if (!_data) return;
    const root = document.getElementById('cs_root');
    await renderer.renderCaseStudy(_data, root);
  }

  async function init() {
    applyTheme(_theme);
    mermaidUtil.init(_theme);
    updateToolbar();
    utils.setText('loading_text', i18n.t('loading'));

    const id   = utils.getParam('id');
    const root = document.getElementById('cs_root');

    if (!id) {
      root.innerHTML = '';
      root.appendChild(renderer.buildNotFound());
      return;
    }

    _data = await loader.fetchCaseStudy(id);

    if (!_data) {
      root.innerHTML = '';
      root.appendChild(renderer.buildNotFound());
      return;
    }

    // Page title / meta
    const heroData = _data.hero ?? _data;
    const title    = i18n.pick(heroData, 'title');
    document.title = `${title} · Hugo Cabrera`;
    const metaDesc = document.getElementById('cs_meta_description');
    if (metaDesc) metaDesc.content = i18n.pick(heroData, 'summary');

    await renderer.renderCaseStudy(_data, root);
  }

  return { init };
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
  const root = document.getElementById('cs_root');
  const id   = utils.getParam('id');
  if (!id) return;
  loader.fetchCaseStudy(id).then(async data => {
    if (!data) return;
    const lang  = i18n.get();
    const heroData = data.hero ?? data;
    const title = i18n.pick(heroData, 'title');
    document.title = `${title} · Hugo Cabrera`;
    document.documentElement.lang = lang;

    const metaDesc = document.getElementById('cs_meta_description');
    if (metaDesc) metaDesc.content = i18n.pick(heroData, 'summary');

    const backText = document.getElementById('btn_back_text');
    const langText = document.getElementById('langText');
    if (backText) backText.textContent = lang === 'es' ? 'Portafolio' : 'Portfolio';
    if (langText) langText.textContent = lang === 'es' ? 'EN' : 'ES';

    await renderer.renderCaseStudy(data, root);
  });
}

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => app.init());
