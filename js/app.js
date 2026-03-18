(function () {
  'use strict';

  let data = null;
  let milestones = [];
  let currentIndex = 0;
  let isAnimating = false;

  const eras = [
    { after: 0, label: 'Pre-War' },
    { after: 11, label: 'First War' },
    { after: 23, label: 'Frozen Conflict' },
    { after: 50, label: 'Post-April War' },
    { after: 55, label: '44-Day War' },
    { after: 62, label: 'Post-War' }
  ];

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const titleEl = $('#title');
  const subtitleEl = $('#subtitle');
  const disclaimerEl = $('#disclaimer');
  const contentEl = $('#milestone-content');
  const nodesContainer = $('#timeline-nodes');
  const trackEl = $('#timeline-track');
  const counterEl = $('#timeline-counter');
  const navLeft = $('#nav-left');
  const navRight = $('#nav-right');

  // === Init ===
  async function init() {
    try {
      const lang = document.documentElement.lang || 'en';
      const dataFile = lang === 'ru' ? 'data/milestones-ru.json' : 'data/milestones.json';
      const resp = await fetch(dataFile);
      data = await resp.json();
    } catch (e) {
      contentEl.innerHTML = '<p style="color:#e55">Failed to load timeline data.</p>';
      return;
    }

    milestones = data.milestones;

    // Header
    titleEl.textContent = data.meta.title;
    subtitleEl.textContent = data.meta.subtitle;
    disclaimerEl.textContent = data.meta.disclaimer;

    renderTimeline();
    bindEvents();

    // Check hash
    const hash = window.location.hash.slice(1);
    if (hash) {
      const idx = milestones.findIndex(m => m.id === hash);
      if (idx !== -1) {
        currentIndex = idx;
      }
    }

    setActive(currentIndex, 0);
  }

  // === Render Timeline Nodes ===
  function renderTimeline() {
    const fragment = document.createDocumentFragment();
    let eraIndex = 0;

    milestones.forEach((m, i) => {
      // Insert era separator if needed
      if (eraIndex < eras.length && i === eras[eraIndex].after && i > 0) {
        const sep = document.createElement('div');
        sep.className = 'era-separator';
        sep.innerHTML = `<span class="era-label">${eras[eraIndex].label}</span><div class="era-line"></div>`;
        fragment.appendChild(sep);
        eraIndex++;
      } else if (eraIndex < eras.length && i === 0 && eras[0].after === 0) {
        eraIndex++; // skip first era marker at index 0
      }

      const node = document.createElement('div');
      node.className = 'timeline-node' + (m.type === 'interval' ? ' interval' : '');
      node.dataset.index = i;

      const year = (m.date || m.dateStart || '').slice(0, 4);
      node.innerHTML = `
        <div class="node-dot"></div>
        <span class="node-label">${year}</span>
      `;

      node.addEventListener('click', () => {
        if (i !== currentIndex) {
          const dir = i > currentIndex ? 1 : -1;
          setActive(i, dir);
        }
      });

      fragment.appendChild(node);
    });

    nodesContainer.appendChild(fragment);
  }

  // === Set Active Milestone ===
  function setActive(index, direction) {
    if (isAnimating || index < 0 || index >= milestones.length) return;

    const prevIndex = currentIndex;
    currentIndex = index;

    // Update URL hash
    history.replaceState(null, '', '#' + milestones[index].id);

    // Update nav buttons
    navLeft.disabled = index === 0;
    navRight.disabled = index === milestones.length - 1;

    // Update counter
    counterEl.textContent = `${index + 1} / ${milestones.length}`;

    // Update timeline nodes
    const nodes = nodesContainer.querySelectorAll('.timeline-node');
    nodes.forEach((n, i) => {
      n.classList.toggle('active', i === index);
    });

    // Scroll timeline to center active node
    scrollToActiveNode(index);

    // Animate content
    if (direction === 0) {
      renderMilestoneContent(milestones[index]);
      return;
    }

    isAnimating = true;
    const outClass = direction > 0 ? 'slide-out-left' : 'slide-out-right';
    const inClass = direction > 0 ? 'slide-in-left' : 'slide-in-right';

    contentEl.classList.add(outClass);

    setTimeout(() => {
      renderMilestoneContent(milestones[index]);
      contentEl.classList.remove(outClass);
      contentEl.classList.add(inClass);

      // Force reflow
      void contentEl.offsetWidth;

      contentEl.classList.remove(inClass);
      isAnimating = false;
    }, 250);
  }

  // === Render Milestone Content ===
  function renderMilestoneContent(m) {
    const inner = contentEl.querySelector('.milestone-inner');

    inner.querySelector('.milestone-date-label').textContent = m.dateLabel;
    inner.querySelector('.milestone-name').textContent = m.name;
    inner.querySelector('.milestone-summary').textContent = m.summary;

    // Quotes
    const quotesEl = inner.querySelector('.milestone-quotes');
    if (m.quotes && m.quotes.length > 0) {
      quotesEl.innerHTML = m.quotes.map(q => `
        <div class="quote-card">
          <p class="quote-text">${escapeHtml(q.text)}</p>
          <div class="quote-attribution">${escapeHtml(q.attribution)}</div>
          ${q.context ? `<div class="quote-context">${escapeHtml(q.context)}</div>` : ''}
          ${q.source ? (q.source.startsWith('http') ? `<a class="quote-source" href="${q.source}" target="_blank" rel="noopener">Source ↗</a>` : `<span class="quote-source-text">${escapeHtml(q.source)}</span>`) : ''}
        </div>
      `).join('');
      quotesEl.style.display = '';
    } else {
      quotesEl.innerHTML = '';
      quotesEl.style.display = 'none';
    }

    // Videos
    const videosEl = inner.querySelector('.milestone-videos');
    if (m.videos && m.videos.length > 0) {
      videosEl.innerHTML = m.videos.map(v => `
        <div class="video-embed">
          <iframe
            src="https://www.youtube-nocookie.com/embed/${v.youtubeId}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
          ${v.title ? `<div class="video-title">${escapeHtml(v.title)}</div>` : ''}
        </div>
      `).join('');
      videosEl.style.display = '';
    } else {
      videosEl.innerHTML = '';
      videosEl.style.display = 'none';
    }

    // Scroll content area to top
    contentEl.scrollTop = 0;
  }

  // === Scroll Timeline ===
  function scrollToActiveNode(index) {
    const nodes = nodesContainer.querySelectorAll('.timeline-node');
    if (!nodes[index]) return;

    const node = nodes[index];
    const trackWidth = trackEl.clientWidth;
    const nodeLeft = node.offsetLeft;
    const nodeWidth = node.offsetWidth;
    const scrollTarget = nodeLeft - trackWidth / 2 + nodeWidth / 2;

    trackEl.scrollTo({
      left: scrollTarget,
      behavior: 'smooth'
    });
  }

  // === Events ===
  function bindEvents() {
    // Arrow buttons
    navLeft.addEventListener('click', () => setActive(currentIndex - 1, -1));
    navRight.addEventListener('click', () => setActive(currentIndex + 1, 1));

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(currentIndex - 1, -1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(currentIndex + 1, 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActive(0, -1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActive(milestones.length - 1, 1);
      }
    });

    // Hash change
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1);
      const idx = milestones.findIndex(m => m.id === hash);
      if (idx !== -1 && idx !== currentIndex) {
        const dir = idx > currentIndex ? 1 : -1;
        setActive(idx, dir);
      }
    });

    // Touch swipe
    let touchStartX = 0;
    let touchStartY = 0;
    const contentArea = $('#content-area');

    contentArea.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    contentArea.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) {
          setActive(currentIndex + 1, 1);
        } else {
          setActive(currentIndex - 1, -1);
        }
      }
    }, { passive: true });
  }

  // === Util ===
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === Go ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
