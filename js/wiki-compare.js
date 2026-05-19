(function () {
  'use strict';

  const SCRIPT = document.currentScript;
  const UI_LANG = (SCRIPT && SCRIPT.dataset.uiLang) === 'ru' ? 'ru' : 'en';
  const LANGS = ['en', 'ru', 'hy', 'az'];

  const I18N = {
    en: {
      langLabel: { en: 'English', ru: 'Русский', hy: 'Հայերեն', az: 'Azərbaycanca' },
      langShort: { en: 'EN', ru: 'RU', hy: 'HY', az: 'AZ' },
      readSourceLabel: 'Open on Wikipedia →',
      sectionSourceLabel: 'Open section on Wikipedia →',
      pageHeader: 'Reading the EN Wikipedia article. Marked spans are points where the RU, HY, or AZ versions diverge — click to compare.',
      omittedIn: 'Not in',
      severityFactual: 'fact',
      severityFraming: 'framing',
      severityOther: 'note',
      sectionLevelDivergencesLabel: 'Cross-version differences in this section',
      articleStructureLabel: 'Article-level differences across the four Wikipedias',
      readOriginal: 'Read the full article on EN Wikipedia',
      noArticles: 'No articles loaded.',
      pickArticle: 'Pick an article',
    },
    ru: {
      langLabel: { en: 'Английский', ru: 'Русский', hy: 'Հայերեն', az: 'Azərbaycanca' },
      langShort: { en: 'EN', ru: 'RU', hy: 'HY', az: 'AZ' },
      readSourceLabel: 'Открыть в Википедии →',
      sectionSourceLabel: 'Открыть раздел в Википедии →',
      pageHeader: 'Вы читаете статью Википедии на английском. Подсвеченные фрагменты — места, где версии RU, HY или AZ расходятся; нажмите, чтобы сравнить.',
      omittedIn: 'Нет в',
      severityFactual: 'факт',
      severityFraming: 'рамка',
      severityOther: 'заметка',
      sectionLevelDivergencesLabel: 'Расхождения версий в этом разделе',
      articleStructureLabel: 'Расхождения уровня статьи между четырьмя Википедиями',
      readOriginal: 'Открыть полную статью в EN Википедии',
      noArticles: 'Статьи не загружены.',
      pickArticle: 'Выберите статью',
    },
  };
  const T = I18N[UI_LANG];

  const STATE = {
    data: null,
    articleId: null,
    openDivergence: null,
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'dataset') Object.assign(node.dataset, attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function pick(obj, lang, fallback) {
    if (!obj) return '';
    if (obj[lang]) return obj[lang];
    if (fallback && obj[fallback]) return obj[fallback];
    return obj.en || obj.ru || '';
  }

  function langTag(lang) {
    return T.langShort[lang] + ' · ' + T.langLabel[lang];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function claimText(c) {
    if (!c) return '';
    const key = 'text_' + UI_LANG;
    if (c[key]) return c[key];
    // Fallbacks: other-language text, then legacy single `text`.
    const otherKey = UI_LANG === 'en' ? 'text_ru' : 'text_en';
    if (c[otherKey]) return c[otherKey];
    return c.text || '';
  }

  // === Divergence panel rendering (4-language claims) ===
  function renderClaimsGrid(div) {
    const grid = el('div', { class: 'wc-claims' });
    LANGS.forEach((lang) => {
      const c = div.claims && div.claims[lang];
      if (!c) return;
      const isOmitted = Array.isArray(div.omitted_in) && div.omitted_in.includes(lang);
      const cell = el('div', { class: 'wc-claim' + (isOmitted ? ' omitted' : '') });
      cell.appendChild(el('div', { class: 'lang-tag' }, langTag(lang)));
      cell.appendChild(el('div', { class: 'wc-claim-text' }, claimText(c)));
      if (c.source) {
        const srcWrap = el('div', { class: 'wc-claim-source' });
        const label = c.source.indexOf('#') >= 0 ? T.sectionSourceLabel : T.readSourceLabel;
        srcWrap.appendChild(el('a', { href: c.source, target: '_blank', rel: 'noopener' }, label));
        cell.appendChild(srcWrap);
      }
      grid.appendChild(cell);
    });
    return grid;
  }

  function renderDivergenceHead(div, withTopic) {
    const head = el('div', { class: 'wc-div-head' });
    if (withTopic) {
      head.appendChild(el('div', { class: 'wc-div-topic' }, pick(div.topic, UI_LANG)));
    } else {
      head.appendChild(el('div', { class: 'wc-div-topic' }, pick(div.topic, UI_LANG)));
    }
    const badges = el('div', { class: 'wc-div-badges' });
    if (div.severity) {
      const label = div.severity === 'factual' ? T.severityFactual
                   : (div.severity === 'framing' ? T.severityFraming : T.severityOther);
      badges.appendChild(el('span', { class: 'wc-badge severity-' + div.severity }, label));
    }
    if (Array.isArray(div.omitted_in) && div.omitted_in.length) {
      const labels = div.omitted_in.map((l) => T.langShort[l]).join(', ');
      badges.appendChild(el('span', { class: 'wc-badge omission' }, T.omittedIn + ' ' + labels));
    }
    head.appendChild(badges);
    return head;
  }

  function renderDivergenceCard(div, opts) {
    opts = opts || {};
    const card = el('div', { class: 'wc-div-card' + (opts.compact ? ' compact' : ''), tabindex: '0', role: 'button' });
    card.dataset.divId = div.id;

    card.addEventListener('click', (e) => {
      // Don't toggle if a link inside was clicked
      if (e.target.tagName === 'A') return;
      card.classList.toggle('open');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('open'); }
    });

    card.appendChild(renderDivergenceHead(div, true));
    const body = el('div', { class: 'wc-div-body' });
    body.appendChild(renderClaimsGrid(div));
    card.appendChild(body);
    return card;
  }

  // === Inline marker rendering (highlight + attached card) ===
  function renderParagraphWithMarkers(text, markersInPara) {
    // markersInPara: [{ marker_text, divergence }, ...]
    // For simplicity, scan one marker at a time, splitting and inserting a span.
    const root = el('p', { class: 'wc-para' });
    let segments = [{ text }]; // mix of {text} and {span: divergence}

    for (const m of markersInPara) {
      const next = [];
      for (const seg of segments) {
        if (seg.span) { next.push(seg); continue; }
        const idx = seg.text.indexOf(m.marker_text);
        if (idx < 0) { next.push(seg); continue; }
        const before = seg.text.slice(0, idx);
        const matched = seg.text.slice(idx, idx + m.marker_text.length);
        const after = seg.text.slice(idx + m.marker_text.length);
        if (before) next.push({ text: before });
        next.push({ span: m.divergence, matched });
        if (after) next.push({ text: after });
      }
      segments = next;
    }

    segments.forEach((seg) => {
      if (seg.text) {
        root.appendChild(document.createTextNode(seg.text));
      } else {
        const span = el('span', {
          class: 'wc-mark severity-' + (seg.span.severity || 'framing'),
          tabindex: '0',
          role: 'button',
          dataset: { divId: seg.span.id },
        }, seg.matched);
        // Append small chip showing how many languages diverge / are omitted
        const omitted = Array.isArray(seg.span.omitted_in) ? seg.span.omitted_in.length : 0;
        const indicator = el('sup', { class: 'wc-mark-indicator' }, omitted ? '⊘' : '⇄');
        span.appendChild(indicator);
        span.addEventListener('click', (e) => { e.stopPropagation(); toggleDivPanel(seg.span, span); });
        span.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDivPanel(seg.span, span); }
        });
        root.appendChild(span);
      }
    });
    return root;
  }

  function toggleDivPanel(div, anchorEl) {
    // Look for an existing panel after the paragraph
    const para = anchorEl.closest('.wc-para');
    if (!para) return;
    let panel = para.nextElementSibling;
    if (panel && panel.classList && panel.classList.contains('wc-inline-panel') && panel.dataset.divId === div.id) {
      panel.remove();
      anchorEl.classList.remove('wc-mark-active');
      return;
    }
    // Remove other open panels in this section
    para.parentElement.querySelectorAll('.wc-inline-panel').forEach(p => p.remove());
    para.parentElement.querySelectorAll('.wc-mark-active').forEach(s => s.classList.remove('wc-mark-active'));
    // Create new panel
    panel = el('div', { class: 'wc-inline-panel', dataset: { divId: div.id } });
    panel.appendChild(renderDivergenceHead(div));
    panel.appendChild(renderClaimsGrid(div));
    para.parentElement.insertBefore(panel, para.nextSibling);
    anchorEl.classList.add('wc-mark-active');
    // Scroll into view if mostly off-screen
    const rect = panel.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // === Section rendering ===
  function renderSection(section, divsForSection, divsInline) {
    const wrap = el('section', { class: 'wc-section' });
    if (section.id !== 'lead') {
      const headingId = 'sec-' + section.id;
      const h = el('h2', { class: 'wc-sec-heading', id: headingId }, section.heading);
      wrap.appendChild(h);
    }
    section.paragraphs.forEach((paraText) => {
      // Find inline markers whose marker_text is in this paragraph
      const here = divsInline.filter(d => paraText.indexOf(d.marker_text) >= 0)
                             .map(d => ({ marker_text: d.marker_text, divergence: d }));
      // Sort by position so highlights are inserted left-to-right
      here.sort((a,b) => paraText.indexOf(a.marker_text) - paraText.indexOf(b.marker_text));
      // De-duplicate marker_text (each unique marker appears once)
      const seen = new Set();
      const unique = here.filter(m => seen.has(m.marker_text) ? false : (seen.add(m.marker_text), true));
      const para = renderParagraphWithMarkers(paraText, unique);
      wrap.appendChild(para);
    });
    // Section-level divergences (no marker_text)
    if (divsForSection.length) {
      const list = el('div', { class: 'wc-section-divs' });
      list.appendChild(el('div', { class: 'wc-section-divs-label' }, T.sectionLevelDivergencesLabel));
      divsForSection.forEach(d => list.appendChild(renderDivergenceCard(d, { compact: true })));
      wrap.appendChild(list);
    }
    return wrap;
  }

  function renderArticle(article) {
    const root = document.getElementById('article-root');
    root.innerHTML = '';

    // Header
    const head = el('header', { class: 'wc-art-head' });
    head.appendChild(el('h1', { class: 'wc-art-title' }, pick(article.topic, UI_LANG)));
    if (article.summary) {
      head.appendChild(el('p', { class: 'wc-art-summary' }, pick(article.summary, UI_LANG)));
    }
    // Title chips for the 4 languages
    const titlesRow = el('div', { class: 'wc-titles-row' });
    LANGS.forEach((lang) => {
      const t = article.titles && article.titles[lang];
      if (!t) return;
      const chip = el('div', { class: 'wc-title-chip' });
      chip.appendChild(el('span', { class: 'lang-tag' }, langTag(lang)));
      chip.appendChild(el('a', { href: t.url, target: '_blank', rel: 'noopener', lang }, t.title));
      if (t.title_en && lang !== 'en') chip.appendChild(el('div', { class: 'title-en' }, t.title_en));
      titlesRow.appendChild(chip);
    });
    head.appendChild(titlesRow);
    root.appendChild(head);

    // Article-level (sidebar) divergences first — important framing context
    const sidebarDivs = (article.divergences || []).filter(d => !d.section_id);
    if (sidebarDivs.length) {
      const wrap = el('aside', { class: 'wc-sidebar-divs' });
      wrap.appendChild(el('div', { class: 'wc-section-divs-label' }, T.articleStructureLabel));
      sidebarDivs.forEach(d => wrap.appendChild(renderDivergenceCard(d, { compact: true })));
      root.appendChild(wrap);
    }

    // Sections with their inline + section-level divergences
    article.sections.forEach((section) => {
      const inSection = (article.divergences || []).filter(d => d.section_id === section.id);
      const inline = inSection.filter(d => d.marker_text);
      const sectionLevel = inSection.filter(d => !d.marker_text);
      root.appendChild(renderSection(section, sectionLevel, inline));
    });

    // Footer link to EN article
    if (article.baseline && article.baseline.url) {
      const foot = el('div', { class: 'wc-art-footer' });
      foot.appendChild(el('a', { href: article.baseline.url, target: '_blank', rel: 'noopener' }, T.readOriginal + ' ↗'));
      root.appendChild(foot);
    }
  }

  function renderArticleTabs() {
    const wrap = document.getElementById('article-tabs');
    wrap.innerHTML = '';
    if (!STATE.data || !STATE.data.articles.length) return;
    STATE.data.articles.forEach((a) => {
      const btn = el('button', {
        class: 'wc-article-tab' + (a.id === STATE.articleId ? ' active' : ''),
        dataset: { articleId: a.id },
        onclick: () => { STATE.articleId = a.id; renderArticleTabs(); renderArticle(getArticle()); window.scrollTo({top:0, behavior:'smooth'}); },
      }, pick(a.topic, UI_LANG));
      wrap.appendChild(btn);
    });
  }

  function getArticle() {
    return STATE.data.articles.find(a => a.id === STATE.articleId);
  }

  async function init() {
    try {
      const conflictId = window.CONFLICT_ID || 'armenia-azerbaijan';
      const resp = await fetch(`/data/${conflictId}/wiki-compare.json`);
      STATE.data = await resp.json();
    } catch (e) {
      console.error('Failed to load wiki-compare.json', e);
      STATE.data = { articles: [] };
    }
    if (STATE.data.articles && STATE.data.articles.length) {
      STATE.articleId = STATE.data.articles[0].id;
    }
    renderArticleTabs();
    if (STATE.articleId) renderArticle(getArticle());
    else document.getElementById('article-root').appendChild(el('div', { class: 'wc-empty' }, T.noArticles));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
