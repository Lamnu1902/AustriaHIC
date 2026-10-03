(() => {
  const DATA_URL = 'data/photos.json';
  const RECHECK_MS = 15 * 60 * 1000; // poll for a newer photos.json while the tab is open
  const REGION_LABEL = { austria: 'Austria', europe: 'Elsewhere in Europe' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https:\/\//i.test(u || '') ? u : '#');

  const ICON = {
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3 6.6 7 .8-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.8Z"/></svg>',
    out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let current = null; // last loaded photos.json
  let countdownTimer = null;

  // ---------------------------------------------------------------- time helpers
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  function relative(iso) {
    if (!iso) return '';
    const diff = (Date.parse(iso) - Date.now()) / 1000;
    const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [u, s] of units) {
      if (Math.abs(diff) >= s || u === 'minute') return rtf.format(Math.round(diff / s), u);
    }
  }
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  function whenLabel(p) {
    if (p.taken_at) return `Captured ${relative(p.taken_at)}`;
    if (p.uploaded_at) return `Shared ${relative(p.uploaded_at)}`;
    return '';
  }

  // ---------------------------------------------------------------- rendering
  function shortlistOf(photo) {
    return [photo, ...(photo.alternates || [])].slice(0, 5);
  }

  function frameHtml(region, p) {
    const when = whenLabel(p);
    const whenTitle = p.taken_at ? fmtDate(p.taken_at) : p.uploaded_at ? fmtDate(p.uploaded_at) : '';
    return `
      <div class="frame" style="background-color:${esc(p.color || '#15181d')}">
        <img class="img-low" src="${esc(p.image_small || p.image)}" alt="" aria-hidden="true" />
        <img class="img-high" src="${esc(p.image)}" alt="${esc(p.title)} — ${esc(p.location || '')}" decoding="async" />
        <div class="frame-top">
          <span class="region">${esc(REGION_LABEL[region])}</span>
          <button class="icon-btn" data-action="expand" aria-label="View full size">${ICON.expand}</button>
        </div>
        <div class="caption">
          ${p.location ? `<span class="location">${ICON.pin}${esc(p.location)}</span>` : ''}
          <h2>${esc(p.title)}</h2>
          ${p.description && !p.title.toLowerCase().includes(p.description.toLowerCase()) ? `<p class="desc">${esc(p.description)}</p>` : ''}
          <div class="meta">
            ${when ? `<span title="${esc(whenTitle)}">${esc(when)}</span><span class="sep">•</span>` : ''}
            <span>by <a href="${esc(safeUrl(p.author_url))}" target="_blank" rel="noopener">${esc(p.author)}</a></span>
            <span class="sep">•</span>
            <a href="${esc(safeUrl(p.license_url))}" target="_blank" rel="noopener license">${esc(p.license)}</a>
          </div>
          <div class="actions">
            ${p.score_label ? `<span class="chip score" title="Why this photo won">${ICON.star}${esc(p.score_label)}</span>` : ''}
            ${p.pool_size ? `<span class="chip" title="Photos that qualified this round">#${p.rank || 1} of ${p.pool_size} from the last ${p.window_days} days</span>` : ''}
            <a class="chip" href="${esc(safeUrl(p.page_url))}" target="_blank" rel="noopener">View original on ${esc(p.source_name || 'source')} ${ICON.out}</a>
          </div>
        </div>
      </div>`;
  }

  function renderPanel(region, photo, activeIndex = 0) {
    const panel = $(`#panel-${region}`);
    panel.classList.remove('is-loading');
    if (!photo) {
      panel.innerHTML = `<div class="panel-error">No photo available right now — the next refresh will try again.</div>`;
      return;
    }
    const list = shortlistOf(photo);
    const shown = { ...list[activeIndex], rank: activeIndex === 0 ? photo.rank : undefined, pool_size: activeIndex === 0 ? photo.pool_size : undefined, window_days: photo.window_days };

    panel.innerHTML = `
      ${frameHtml(region, shown)}
      ${list.length > 1 ? `
        <p class="shortlist-label">Today's shortlist</p>
        <div class="shortlist" role="list">
          ${list.map((p, i) => `
            <button class="thumb ${i === activeIndex ? 'is-active' : ''}" data-index="${i}" role="listitem"
              aria-label="Show ${esc(p.title)}" aria-pressed="${i === activeIndex}">
              <img src="${esc(p.image_small || p.image)}" alt="" loading="lazy" />
            </button>`).join('')}
        </div>` : ''}`;

    const frame = $('.frame', panel);
    const hi = $('.img-high', frame);
    const sharpen = () => frame.classList.add('is-sharp');
    if (hi.complete && hi.naturalWidth) sharpen(); else hi.addEventListener('load', sharpen, { once: true });
    hi.addEventListener('error', () => { hi.src = shown.image_small || hi.src; }, { once: true });

    $('[data-action="expand"]', panel).addEventListener('click', () => openLightbox(shown));
    panel.querySelectorAll('.thumb').forEach((btn) =>
      btn.addEventListener('click', () => renderPanel(region, photo, Number(btn.dataset.index))));
  }

  // ---------------------------------------------------------------- lightbox
  const lightbox = $('#lightbox');
  function openLightbox(p) {
    $('#lightbox-img').src = p.image;
    $('#lightbox-img').alt = p.title;
    $('#lightbox-caption').textContent = `${p.title} · ${p.location || ''} · © ${p.author} (${p.license})`;
    if (typeof lightbox.showModal === 'function') lightbox.showModal();
    else window.open(p.image, '_blank', 'noopener');
  }
  $('#lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });

  // ---------------------------------------------------------------- status bar
  function startCountdown(nextIso) {
    clearInterval(countdownTimer);
    const el = $('#status-text');
    const tick = () => {
      const ms = Date.parse(nextIso) - Date.now();
      if (ms <= 0) { el.textContent = 'New photos arriving shortly…'; return; }
      const h = Math.floor(ms / 3.6e6);
      const m = Math.floor((ms % 3.6e6) / 6e4);
      el.textContent = `Next refresh in ${h ? `${h}h ` : ''}${m}m`;
    };
    tick();
    countdownTimer = setInterval(tick, 30_000);
  }

  function renderMeta(data) {
    $('#updated').textContent = `Last updated ${new Date(data.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`;
    $('#ranking-copy').textContent = data.ranking === 'unsplash-likes'
      ? 'Every six hours a GitHub Action searches Unsplash for nature photos shared in the last week and ranks them by likes (editor picks get a small boost). If nothing qualifies, it falls back to Wikimedia Commons.'
      : 'Every six hours a GitHub Action searches Wikimedia Commons for landscape photos captured in the last week and ranks them on community curation (Quality / Featured image status), resolution and how clearly they show scenery. If nothing qualifies, the window widens to two weeks, then a month.';
    startCountdown(data.next_update_at);
  }

  // ---------------------------------------------------------------- data
  async function load(initial = false) {
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (!initial && current && current.generated_at === data.generated_at) return;
      current = data;
      renderPanel('austria', data.austria);
      renderPanel('europe', data.europe);
      renderMeta(data);
    } catch (err) {
      if (initial) {
        ['austria', 'europe'].forEach((r) => {
          const panel = $(`#panel-${r}`);
          panel.classList.remove('is-loading');
          panel.innerHTML = '<div class="panel-error">Couldn’t load photos. Check your connection and refresh.</div>';
        });
        $('#status-text').textContent = 'Offline';
      }
      console.error('Failed to load photos.json', err);
    }
  }

  load(true);
  setInterval(load, RECHECK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
