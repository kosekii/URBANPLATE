(() => {
  'use strict';

  // ---------- Constants and helpers ----------
  const BOROUGHS = ['Philippines', 'USA', 'Canada', 'UAE', 'UK', 'Singapore'];
  const BCOL = {
    Philippines: '#E4572E',
    USA: '#6B86D6',
    Canada: '#C98A5B',
    UAE: '#E8A15A',
    UK: '#5FAE8B',
    Singapore: '#C46AA6',
  };
  const TINTS = ['#F1E3C8', '#E3EBDD', '#F6DDD0', '#EADFC9'];
  const PALETTES = [
    ['#E4572E', '#F2A93B', '#7BAE6B', '#C9381F'],
    ['#8C4A2F', '#5E7F3A', '#E4572E', '#F2D16B'],
    ['#7BAE6B', '#E4572E', '#F2D16B', '#3E6B3A'],
    ['#4A2C1B', '#F6F0E4', '#8C4A2F', '#E4572E'],
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('en-US');

  async function api(path, options = {}) {
    const res = await fetch('/api/restaurants' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let body = null;
    try { body = await res.json(); } catch (e) { /* no JSON body */ }
    if (!res.ok) {
      const err = new Error((body && body.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function toast(message, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ---------- Little illustrations (plates + skyline) ----------
  function rng(seed) {
    let s = (seed % 233280) || 1;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }
  function hash(str) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }
  function plateSVG(seed) {
    const r = rng(seed + 3);
    const P = PALETTES[seed % 4];
    let s = '<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">';
    s += '<circle cx="100" cy="100" r="98" fill="#fff"/><circle cx="100" cy="100" r="88" fill="#ECE2CF"/><circle cx="100" cy="100" r="74" fill="#fff"/>';
    s += `<ellipse cx="100" cy="102" rx="46" ry="38" fill="${P[0]}"/><ellipse cx="100" cy="104" rx="30" ry="22" fill="${P[3]}"/>`;
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      const rad = 22 + r() * 40;
      const size = 3 + r() * 6;
      s += `<circle cx="${(100 + Math.cos(a) * rad).toFixed(1)}" cy="${(100 + Math.sin(a) * rad).toFixed(1)}" r="${size.toFixed(1)}" fill="${P[1 + Math.floor(r() * 3)]}"/>`;
    }
    for (let i = 0; i < 4; i++) {
      const x = 70 + r() * 60, y = 70 + r() * 60, rot = (r() * 180).toFixed(0);
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="12" ry="4.5" fill="#5E8F4E" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    return s + '</svg>';
  }
  function skylineSVG(w, h, color, seed) {
    const r = rng(seed);
    let x = 0, s = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">`;
    while (x < w) {
      const bw = 14 + Math.floor(r() * 24);
      const bh = Math.round(h * (0.3 + r() * 0.7));
      s += `<rect x="${x}" y="${h - bh}" width="${Math.min(bw, w - x)}" height="${bh}" fill="${color}"/>`;
      x += bw + 3;
    }
    return s + '</svg>';
  }

  // ---------- Small render helpers ----------
  const addressText = (a) => [[a.building, a.street].filter(Boolean).join(' '), a.zipcode].filter(Boolean).join(', ') || 'No address';
  const gradeBadge = (g) =>
    g && g.grade
      ? `<span class="grade g-${esc(g.grade)}">Grade ${esc(g.grade)} (${esc(g.score)})</span>`
      : '<span class="grade g-none">Not graded</span>';
  const boroughTag = (b) => `<span class="tag" style="--c:${BCOL[b] || '#999'}"><i></i>${esc(b)}</span>`;

  // ---------- State ----------
  const state = { q: '', field: 'name', borough: '', page: 1, limit: 10, pages: 1, total: 0 };
  let rowsById = new Map();
  let pendingDelete = null;
  let listRequestId = 0;

  // ---------- LIST ----------
  function skeletonRows() {
    return Array.from({ length: 5 }, () =>
      '<tr class="skeleton">' + '<td><span></span></td>'.repeat(6) + '</tr>').join('');
  }

  async function loadList() {
    const requestId = ++listRequestId;
    const tbody = $('#tbody');
    tbody.innerHTML = skeletonRows();
    $('#summary').textContent = 'Loading...';

    const params = new URLSearchParams({ page: state.page, limit: state.limit, field: state.field });
    if (state.q) params.set('q', state.q);
    if (state.borough) params.set('borough', state.borough);

    try {
      const res = await api('?' + params.toString());
      if (requestId !== listRequestId) return;
      state.pages = res.pages;
      state.total = res.total;
      rowsById = new Map(res.data.map((r) => [r._id, r]));
      renderRows(res.data);
      renderPager();
      renderSummary();
    } catch (err) {
      if (requestId !== listRequestId) return;
      tbody.innerHTML = `<tr class="state-row"><td colspan="6">
        <strong>The list could not load</strong>
        ${esc(err.message)}. Check that the server is running and your MONGODB_URI in .env is correct.
        <br><button type="button" class="btn btn-dark btn-sm" data-retry>Try again</button></td></tr>`;
      $('#summary').textContent = 'Could not load restaurants.';
      $('#pager').innerHTML = '';
    }
  }

  function renderRows(data) {
    const tbody = $('#tbody');
    if (!data.length) {
      const what = state.q ? `"${esc(state.q)}"` : 'these filters';
      tbody.innerHTML = `<tr class="state-row"><td colspan="6">
        <strong>No restaurants match ${what}</strong>
        Try a different keyword, switch the borough, or add it as a new spot.
        <br><button type="button" class="btn btn-ghost btn-sm" data-reset>Clear filters</button>
        <button type="button" class="btn btn-primary btn-sm" data-open-add>Add a spot</button></td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r) => `
      <tr data-id="${esc(r._id)}">
        <td class="t-name-cell t-name">${esc(r.name)}</td>
        <td data-label="Country">${boroughTag(r.borough)}</td>
        <td data-label="Cuisine">${esc(r.cuisine)}</td>
        <td data-label="Address">${esc(addressText(r.address))}</td>
        <td data-label="Latest grade">${gradeBadge(r.grade)}</td>
        <td class="t-actions">
          <button type="button" class="btn btn-ghost" data-edit="${esc(r._id)}" aria-label="Edit ${esc(r.name)}">Edit</button>
          <button type="button" class="btn btn-soft-danger" data-delete="${esc(r._id)}" aria-label="Delete ${esc(r.name)}">Delete</button>
        </td>
      </tr>`).join('');
  }

  function renderSummary() {
    const parts = [];
    if (state.q) parts.push(`${state.field} matching "${state.q}"`);
    if (state.borough) parts.push(`in ${state.borough}`);
    const filterText = parts.length ? ' ' + parts.join(' ') : '';
    $('#summary').textContent = `${fmt(state.total)} restaurant${state.total === 1 ? '' : 's'}${filterText}. Page ${state.page} of ${state.pages}.`;
  }

  function renderPager() {
    const pager = $('#pager');
    if (state.pages <= 1) { pager.innerHTML = ''; return; }
    const first = Math.max(1, Math.min(state.page - 2, state.pages - 4));
    const last = Math.min(state.pages, first + 4);
    let html = `<button type="button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>Previous</button>`;
    for (let p = first; p <= last; p++) {
      html += `<button type="button" data-page="${p}" ${p === state.page ? 'aria-current="page"' : ''}>${p}</button>`;
    }
    html += `<button type="button" data-page="${state.page + 1}" ${state.page === state.pages ? 'disabled' : ''}>Next</button>`;
    pager.innerHTML = html;
  }

  function renderChips() {
    const items = [['', 'All countries']].concat(BOROUGHS.map((b) => [b, b]));
    $('#chips').innerHTML = items.map(([value, label]) =>
      `<button type="button" class="chip" data-borough="${esc(value)}" aria-pressed="${state.borough === value}" ${value ? `style="--c:${BCOL[value]}"` : ''}>
        ${value ? '<i></i>' : ''}${esc(label)}</button>`).join('');
  }

  function syncControls() {
    $('#field').value = state.field;
    $('#q').value = state.q;
    renderChips();
    $$('#boroughTiles .tile').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.borough === state.borough)));
  }

  function applyFilters(changes, scroll = false) {
    Object.assign(state, changes, { page: changes.page || 1 });
    syncControls();
    loadList();
    if (scroll) document.getElementById('list').scrollIntoView();
  }

  // ---------- HOME: featured, tiles, stats ----------
    const slug = (s) =>
    String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  async function loadFeatured() {
    const grid = $('#featuredGrid');
    try {
      const items = await api('/featured');
      if (!items.length) { grid.innerHTML = '<p class="muted">No restaurants yet. Add the first one.</p>'; return; }
      grid.innerHTML = items.map((r, i) => `
        <button type="button" class="spot" data-find="${esc(r.name)}">
          <div class="spot-photo" style="--tint:${TINTS[i % 4]}">
            <img class="spot-img" src="img/food/${slug(r.name)}.jpg" alt="${esc(r.name)}" loading="lazy">
          </div>
          <div class="spot-body">
            <div class="spot-meta">${boroughTag(r.borough)}<span>${esc(r.cuisine)}</span></div>
            <h3>${esc(r.name)}</h3>
            <p class="addr">${esc(addressText(r.address))}</p>
            <div class="spot-foot">${gradeBadge(r.grade)}</div>
          </div>
        </button>`).join('');

      // No photo for that brand yet? Fall back to the cartoon plate.
      $$('.spot-img', grid).forEach((img) => {
        img.addEventListener('error', () => {
          img.parentElement.innerHTML = plateSVG(hash(img.alt));
        }, { once: true });
      });
    } catch (err) {
      grid.innerHTML = `<p class="muted">Could not load featured spots: ${esc(err.message)}</p>`;
    }
  }

  function renderTiles(counts) {
    $('#boroughTiles').innerHTML = BOROUGHS.map((b, i) => `
      <button type="button" class="tile" data-borough="${esc(b)}" aria-pressed="${state.borough === b}">
        ${skylineSVG(200, 96, BCOL[b], i + 20)}
        <span class="tile-name">${esc(b)}</span>
        <span class="tile-count">${counts && counts[b] !== undefined ? fmt(counts[b]) + ' restaurants' : 'Browse the list'}</span>
      </button>`).join('');
  }

  async function loadStats() {
    try {
      const s = await api('/stats');
      renderTiles(s.boroughs);
      $('#statTotal').textContent = fmt(s.total);
      $('#statCuisines').textContent = fmt(s.cuisines);
    } catch (err) {
      renderTiles(null);
    }
  }

  // ---------- BEST QUALITY ----------
  async function loadBest() {
    const list = $('#bestList');
    try {
      const res = await api('/best?min=90');
      $('#bestMin').textContent = res.threshold;
      if (!res.data.length) {
        list.innerHTML = `<li class="muted">No restaurant has an aggregated score above ${res.threshold} yet.</li>`;
        return;
      }
      list.innerHTML = res.data.map((r, i) => `
        <li>
          <span class="rank">${i + 1}</span>
          <div>
            <h3>${esc(r.name)}</h3>
            <div class="meta">${boroughTag(r.borough)}<span>${esc(r.cuisine)}</span>${gradeBadge(r.grade)}</div>
          </div>
          <div class="total"><b>${fmt(r.totalScore)}</b><small>aggregated score</small></div>
        </li>`).join('');
    } catch (err) {
      list.innerHTML = `<li class="muted">Could not load the best quality list: ${esc(err.message)}</li>`;
    }
  }

  // ---------- ADD / EDIT ----------
  const formDialog = $('#formDialog');
  const form = $('#restaurantForm');

  function openForm(restaurant) {
    form.reset();
    $('#formError').hidden = true;
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    if (restaurant) {
      $('#formTitle').textContent = 'Edit restaurant';
      $('#formHint').textContent = 'Change what you need. A new grade or score is saved as a new inspection.';
      $('#formSubmit').textContent = 'Save changes';
      $('#fId').value = restaurant._id;
      $('#fName').value = restaurant.name;
      $('#fBorough').value = restaurant.borough;
      $('#fCuisine').value = restaurant.cuisine;
      $('#fBuilding').value = restaurant.address.building;
      $('#fStreet').value = restaurant.address.street;
      $('#fZip').value = restaurant.address.zipcode;
      $('#fGrade').value = restaurant.grade ? restaurant.grade.grade || '' : '';
      $('#fScore').value = restaurant.grade && restaurant.grade.score !== undefined ? restaurant.grade.score : '';
    } else {
      $('#formTitle').textContent = 'Add a spot';
      $('#formHint').textContent = 'Fill in the details. This saves straight to the dbRestaurants collection.';
      $('#formSubmit').textContent = 'Save spot';
      $('#fId').value = '';
      if (state.borough) $('#fBorough').value = state.borough;
    }
    formDialog.showModal();
    $('#fName').focus();
  }

  function showFormError(message, fieldIds = []) {
    const box = $('#formError');
    box.textContent = message;
    box.hidden = false;
    fieldIds.forEach((id) => $('#' + id).closest('.field').classList.add('invalid'));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    $('#formError').hidden = true;

    const payload = {
      name: $('#fName').value.trim(),
      borough: $('#fBorough').value,
      cuisine: $('#fCuisine').value.trim(),
      building: $('#fBuilding').value.trim(),
      street: $('#fStreet').value.trim(),
      zipcode: $('#fZip').value.trim(),
      grade: $('#fGrade').value,
      score: $('#fScore').value,
    };

    const missing = [];
    if (!payload.name) missing.push('fName');
    if (!payload.borough) missing.push('fBorough');
    if (!payload.cuisine) missing.push('fCuisine');
    if (missing.length) { showFormError('Fill in the name, country and cuisine before saving.', missing); return; }
    if (payload.score !== '' && (Number(payload.score) < 0 || Number(payload.score) > 200)) {
      showFormError('Score must be a number from 0 to 200.', ['fScore']);
      return;
    }

    const id = $('#fId').value;
    const submit = $('#formSubmit');
    submit.disabled = true;
    try {
      await api(id ? '/' + id : '', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      formDialog.close();
      toast(id ? 'Changes saved.' : `${payload.name} added to the list.`);
      refreshAll();
    } catch (err) {
      showFormError(err.message);
    } finally {
      submit.disabled = false;
    }
  });

  // Clear the error styling as soon as someone fixes a field.
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field) field.classList.remove('invalid');
    $('#formError').hidden = true;
  });

  // ---------- DELETE ----------
  const confirmDialog = $('#confirmDialog');

  function askDelete(r) {
    pendingDelete = r;
    $('#confirmText').textContent = `${r.name} (${r.borough}) will be removed from the database. You can't undo this.`;
    confirmDialog.showModal();
  }

  $('#confirmDelete').addEventListener('click', async () => {
    if (!pendingDelete) return;
    const btn = $('#confirmDelete');
    btn.disabled = true;
    try {
      await api('/' + pendingDelete._id, { method: 'DELETE' });
      confirmDialog.close();
      toast(`${pendingDelete.name} deleted.`);
      pendingDelete = null;
      // Step back a page if that was the last row on this page.
      if (rowsById.size === 1 && state.page > 1) state.page -= 1;
      refreshAll();
    } catch (err) {
      confirmDialog.close();
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  function refreshAll() {
    loadList();
    loadFeatured();
    loadBest();
    loadStats();
  }

  // ---------- Dialog plumbing ----------
  [formDialog, confirmDialog].forEach((dlg) => {
    dlg.addEventListener('mousedown', (e) => {
      // A click on the dimmed backdrop (outside the box) closes the dialog.
      const box = dlg.getBoundingClientRect();
      const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
      if (e.target === dlg && outside) dlg.close();
    });
  });

  // ---------- AUTOCOMPLETE (works with name and cuisine) ----------
  function setupAutocomplete(inputId, fieldId, resultsId, scrollOnPick) {
    const input = $('#' + inputId);
    const field = $('#' + fieldId);
    const list = $('#' + resultsId);
    let requestId = 0;
    let activeIndex = -1;

    function hide() {
      list.hidden = true;
      activeIndex = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    async function showMatches() {
      const q = input.value.trim();
      const id = ++requestId;
      if (!q || document.activeElement !== input) { hide(); return; }

      const params = new URLSearchParams({ q, field: field.value });
      if (inputId === 'q' && state.borough) params.set('borough', state.borough);
      try {
        const response = await api('/suggest?' + params);
        if (id !== requestId || document.activeElement !== input) return;
        const options = response.suggestions || [];
        list.innerHTML = options.length
          ? options.map((value) => `<button type="button" role="option" aria-selected="false" class="suggest-option" data-suggestion="${esc(value)}">${esc(value)}</button>`).join('')
          : '<span class="suggest-empty">No matching suggestions in the database</span>';
        activeIndex = -1;
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      } catch (err) {
        if (id !== requestId) return;
        hide();
      }
    }

    const debouncedMatches = debounce(showMatches, 180);
    input.addEventListener('input', () => {
      ++requestId;
      hide();
      debouncedMatches();
    });
    input.addEventListener('focus', () => {
      if (input.value.trim()) showMatches();
    });
    field.addEventListener('change', () => {
      ++requestId;
      hide();
      if (document.activeElement === input && input.value.trim()) showMatches();
    });

    function select(value) {
      ++requestId;
      input.value = value;
      hide();
      applyFilters({ q: value, field: field.value }, scrollOnPick);
    }

    list.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-suggestion]')) e.preventDefault();
    });
    list.addEventListener('click', (e) => {
      const option = e.target.closest('[data-suggestion]');
      if (option) select(option.dataset.suggestion);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { ++requestId; hide(); return; }
      if (list.hidden) return;
      const options = $$('.suggest-option', list);
      if (!options.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = e.key === 'ArrowDown'
          ? (activeIndex + 1) % options.length
          : (activeIndex + options.length - 1) % options.length;
        options.forEach((option, i) => {
          option.classList.toggle('is-active', i === activeIndex);
          option.setAttribute('aria-selected', String(i === activeIndex));
        });
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        select(options[activeIndex].dataset.suggestion);
      }
    });
    document.addEventListener('click', (e) => {
      if (!input.closest('.suggest-wrap').contains(e.target)) {
        ++requestId;
        hide();
      }
    });
  }

  setupAutocomplete('q', 'field', 'searchSuggestions', false);
  setupAutocomplete('heroQ', 'heroField', 'heroSuggestions', true);

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;

    if (t.matches('[data-open-add]')) { openForm(null); return; }
    if (t.matches('[data-close]')) { t.closest('dialog').close(); return; }
    if (t.dataset.edit) { const r = rowsById.get(t.dataset.edit); if (r) openForm(r); return; }
    if (t.dataset.delete) { const r = rowsById.get(t.dataset.delete); if (r) askDelete(r); return; }
    if (t.dataset.page) { state.page = Number(t.dataset.page); loadList(); document.getElementById('list').scrollIntoView(); return; }
    if (t.matches('[data-retry]')) { loadList(); return; }
    if (t.matches('[data-reset]')) { applyFilters({ q: '', borough: '', field: 'name' }); return; }
    if (t.matches('.chip')) { applyFilters({ borough: t.dataset.borough }); return; }
    if (t.matches('.tile')) {
      applyFilters({ borough: state.borough === t.dataset.borough ? '' : t.dataset.borough }, true);
      return;
    }
    if (t.matches('.spot')) { applyFilters({ q: t.dataset.find, field: 'name', borough: '' }, true); return; }
  });

  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters({ q: $('#q').value.trim(), field: $('#field').value });
  });
  $('#q').addEventListener('input', debounce(() => applyFilters({ q: $('#q').value.trim(), field: $('#field').value }), 350));
  $('#field').addEventListener('change', () => applyFilters({ q: $('#q').value.trim(), field: $('#field').value }));
  $('#clearBtn').addEventListener('click', () => applyFilters({ q: '', field: 'name', borough: '' }));

  $('#heroSearch').addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters({ q: $('#heroQ').value.trim(), field: $('#heroField').value }, true);
  });

  // Mobile menu
  const burger = $('#burger');
  const nav = $('#nav');
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  });

  // Highlight the nav link for the section in view
  const sectionToNav = { home: 'home', featured: 'home', boroughs: 'home', about: 'about', list: 'list', best: 'best' };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const target = sectionToNav[en.target.id];
        $$('#nav a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + target)));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(sectionToNav).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // ---------- Start ----------
  function init() {
    $('#year').textContent = new Date().getFullYear();
    $('#footBoroughs').innerHTML = BOROUGHS.map((b) => `<li>${esc(b)}</li>`).join('');
    renderTiles(null);
    syncControls();
    loadList();
    loadFeatured();
    loadStats();
    loadBest();
  }

  init();
})();
