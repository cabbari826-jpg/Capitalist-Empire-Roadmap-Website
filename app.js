'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const list = value => Array.isArray(value) ? value : [];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fraction = value => Math.min(1, Math.max(0, Number(value) || 0));
  const percent = value => Math.round(fraction(value) * 100);
  const path = value => typeof value === 'string' && /^img\/[\w./ -]+$/.test(value) && !value.split('/').includes('..') ? value : '';
  const state = value => ['done', 'in-progress'].includes(value) ? value : 'todo';
  const stateLabel = value => ({done:'Done','in-progress':'In progress',todo:'To do'})[state(value)];
  const icon = value => ({done:'✓','in-progress':'◐',todo:'○'})[state(value)];
  const empty = text => `<p class="empty">${escape(text)}</p>`;
  // Exported screenshot names can be reused. Both sizes share a data revision.
  const assetURL = src => {const clean = path(src);return clean ? `${clean}?v=${encodeURIComponent(data?.generatedAt || '')}` : '';};
  const image = (src, title, className = '') => `<img src="${escape(assetURL(src))}" alt="${escape(title)}" loading="lazy"${className ? ` class="${className}"` : ''}>`;
  const dateLabel = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  };
  const tabs = [['buildings','Buildings'],['repaints','Before → After'],['screenshots','Map screenshots'],['vehicles','Vehicles'],['products','Products'],['deposits','Deposits']];
  let data = null;
  let activeTab = 'buildings';
  let city = '';
  let role = '';
  let query = '';
  let fetching = false;
  const phaseOpen = new Map();
  const comparisons = new Map();
  const lightbox = $('lightbox');
  const assets = new Map();
  let assetSequence = 0;

  function setHTML(id, markup) {
    const element = $(id);
    if (element.dataset.markup !== markup) {
      element.innerHTML = markup;
      element.dataset.markup = markup;
    }
  }

  function registerAsset(src, title, details) {
    // Stable keys keep unchanged galleries mounted during background refreshes.
    const key = JSON.stringify([assetURL(src),title,details]);
    if (!assets.has(key)) assets.set(key, {src:assetURL(src), title, details, id:++assetSequence});
    return `data-image="${escape(key)}"`;
  }

  function updateAge() {
    if (!data) return;
    const timestamp = new Date(data.generatedAt).getTime();
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    $('updated').textContent = Number.isNaN(timestamp) ? 'Update time unavailable' : `Updated ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    if (!Number.isNaN(timestamp)) $('updated').title = new Date(timestamp).toLocaleString();
  }

  function renderSummary() {
    const summary = data.summary || {};
    setHTML('summary-text', `<strong>${escape(summary.done ?? 0)}</strong> of ${escape(summary.total ?? 0)} goals done`);
    const value = percent(summary.progress);
    $('overall-progress').setAttribute('aria-valuenow', value);
    $('overall-progress').setAttribute('aria-valuetext', `${value}% complete`);
    $('overall-progress').firstElementChild.style.width = `${value}%`;
    updateAge();
  }

  function renderActivity() {
    const activity = data.activity || {};
    const mode = activity.quotaReached ? 'paused' : activity.running ? 'running' : 'idle';
    const label = activity.quotaReached ? "Paused until ChatGPT's image quota resets" : activity.running ? 'ChatGPT is painting' : 'Idle';
    const names = new Map(list(data.gallery?.buildings).map(item => [item.id, item.title]));
    const humanize = value => names.get(value) || value.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase());
    const events = list(activity.recent).map(value => {
      const event = String(value);
      const match = event.match(/^(done|tilted)\s+(.+)$/i);
      return match ? `<span class="event ${match[1].toLowerCase() === 'tilted' ? 'retry' : ''}"><span class="event-icon">${match[1].toLowerCase() === 'done' ? '✓' : '↻ retry'}</span>${escape(humanize(match[2]))}</span>` : `<span class="event">${escape(event)}</span>`;
    }).join('');
    $('activity').className = `activity panel ${mode}`;
    setHTML('activity', `<div><p class="activity-label"><span class="activity-dot" aria-hidden="true"></span>${escape(label)}</p><h2>${escape(activity.current || 'Now painting')}</h2><p class="activity-sub"><strong>${escape(activity.paintedToday ?? 0)}</strong> paintings so far in this run</p></div><div class="events">${events || '<span class="muted">No recent painting events.</span>'}</div>`);
  }

  function renderPoster() {
    const roadmap = data.roadmap || {};
    setHTML('poster', path(roadmap.picture) ? `<button class="poster-button" ${registerAsset(roadmap.picture,'Map & Graphics Roadmap','Current roadmap poster')} aria-label="Open current roadmap poster">${image(roadmap.picture,'Map & Graphics Roadmap')}</button>` : empty('The roadmap poster will appear here.'));
    const pictures = [...list(roadmap.pictures)].sort((a,b) => String(b.at || '').localeCompare(String(a.at || '')));
    setHTML('poster-history', pictures.map(picture => `<button class="history-card" ${registerAsset(picture.full || picture.thumb,'Map & Graphics Roadmap',picture.at || '')} aria-label="${escape(`Open roadmap poster ${picture.at || ''}`)}">${image(picture.thumb || picture.full,`Map & Graphics Roadmap — ${picture.at || ''}`)}<span>${escape(picture.at)}</span></button>`).join(''));
  }

  function renderPhases() {
    const phases = list(data.roadmap?.phases);
    const markup = phases.map((phase,index) => {
      const key = String(phase.id ?? index);
      const open = phaseOpen.has(key) ? phaseOpen.get(key) : !(matchMedia('(max-width: 640px)').matches && state(phase.state) === 'done');
      return `<details class="phase ${state(phase.state)}" data-phase="${escape(key)}"${open ? ' open' : ''}><summary><div class="phase-head"><span class="phase-number">${index+1}</span><h3>${escape(phase.label)}</h3><span class="state-chip ${state(phase.state)}">${stateLabel(phase.state)}</span><span class="phase-chevron" aria-hidden="true">⌄</span></div><div class="phase-progress"><div class="progress" role="progressbar" aria-label="${escape(phase.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(phase.progress)}"><span style="width:${percent(phase.progress)}%"></span></div><span>${percent(phase.progress)}%</span></div></summary><ul class="phase-items">${list(phase.items).map(item => `<li class="phase-item"><span class="status-icon ${state(item.state)}" role="img" aria-label="${stateLabel(item.state)}">${icon(item.state)}</span><div><p class="item-title">${escape(item.title)}</p>${item.detail ? `<p class="item-detail">${escape(item.detail)}</p>` : ''}${item.count || item.date && state(item.state) === 'done' ? `<div class="item-meta">${item.count ? `<span>${escape(item.count)}</span><div class="progress count-progress" role="progressbar" aria-label="${escape(item.title)} count progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(item.progress)}"><span style="width:${percent(item.progress)}%"></span></div>` : ''}${item.date && state(item.state) === 'done' ? `<time datetime="${escape(item.date)}">${escape(dateLabel(item.date))}</time>` : ''}</div>` : ''}</div></li>`).join('') || '<li class="empty">No goals in this phase yet.</li>'}</ul></details>`;
    }).join('') || empty('Roadmap phases will appear here.');
    setHTML('phases', markup);
    $('phases').querySelectorAll('details').forEach(element => {
      element.ontoggle = () => phaseOpen.set(element.dataset.phase,element.open);
    });
    const recent = phases.flatMap(phase => list(phase.items).filter(item => item.date).map(item => ({...item,phase:phase.label}))).sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,8);
    setHTML('completed', recent.map(item => `<article class="completion"><span class="check" aria-hidden="true">✓</span><div><p>${escape(item.title)}</p><small>${escape(item.phase)} · <time datetime="${escape(item.date)}">${escape(dateLabel(item.date))}</time></small></div></article>`).join('') || empty('Completed goals will appear here.'));
  }

  function renderFilters() {
    const buildings = list(data.gallery?.buildings);
    const chips = (field, selected) => {
      const values = [...new Set(buildings.map(item => item[field]).filter(Boolean))].sort();
      return ['',...values].map(value => `<button class="chip" data-filter="${field}" data-value="${escape(value)}" aria-pressed="${value === selected}">${escape(value || `All ${field === 'city' ? 'cities' : 'roles'}`)}</button>`).join('');
    };
    setHTML('city-filters', chips('city',city));
    setHTML('role-filters', chips('role',role));
  }

  function renderGallery() {
    setHTML('gallery-tabs', tabs.map(([key,label]) => `<button id="tab-${key}" class="tab" role="tab" aria-controls="gallery-panel" aria-selected="${key === activeTab}" tabindex="${key === activeTab ? 0 : -1}" data-tab="${key}">${label}<span class="tab-count">${escape(data.counts?.[key] ?? list(data.gallery?.[key]).length)}</span></button>`).join(''));
    $('gallery-panel').setAttribute('aria-labelledby', `tab-${activeTab}`);
    $('filters').hidden = activeTab !== 'buildings';
    if (activeTab === 'buildings') renderFilters();
    let items = list(data.gallery?.[activeTab]);
    if (activeTab === 'buildings') items = items.filter(item => (!city || item.city === city) && (!role || item.role === role) && [item.title,item.city,item.role,item.era,item.lot].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
    const label = tabs.find(([key]) => key === activeTab)[1];
    $('gallery-result').textContent = `${items.length} ${activeTab === 'repaints' ? 'comparisons' : label.toLowerCase()}${activeTab === 'buildings' && (city || role || query) ? ' matching your filters' : ' in the collection'}`;
    $('gallery-grid').className = `gallery-grid ${activeTab === 'repaints' || activeTab === 'screenshots' ? activeTab : ['vehicles','products','deposits'].includes(activeTab) ? 'compact' : ''}`;
    setHTML('gallery-grid', items.map((item,index) => {
      if (activeTab === 'repaints') {
        const key = String(item.id ?? index);
        const split = comparisons.get(key) ?? 50;
        return `<article class="comparison"><div class="comparison-images" style="--split:${split}%">${image(item.after,item.title + ' — after')}${image(item.before,item.title + ' — before','before-image')}<span class="compare-label before">BEFORE</span><span class="compare-label after">AFTER</span><span class="comparison-line"></span><input type="range" min="0" max="100" value="${split}" data-comparison="${escape(key)}" aria-label="Compare before and after: ${escape(item.title)}" aria-valuetext="${split}% before, ${100-split}% after"></div><div class="comparison-footer"><h3>${escape(item.title)}</h3><time datetime="${escape(item.date)}">${escape(dateLabel(item.date))}</time></div></article>`;
      }
      const details = [item.role,item.city,item.era,item.lot,item.kind,item.caption,item.date && dateLabel(item.date)].filter(Boolean).join(' · ');
      return `<button class="art-card" ${registerAsset(item.full || item.thumb,item.title,details)} aria-label="${escape(`View ${item.title}`)}"><div class="art-image">${image(item.thumb,item.title)}</div><div class="art-info"><h3>${escape(item.title)}</h3>${item.role ? `<p class="art-role">${escape(item.role)}</p>` : ''}<p class="art-meta">${escape([item.city,item.era,item.lot,item.kind].filter(Boolean).join(' · '))}</p>${item.caption ? `<p class="art-caption">${escape(item.caption)}</p>` : ''}${item.date ? `<p class="art-meta"><time datetime="${escape(item.date)}">${escape(dateLabel(item.date))}</time></p>` : ''}</div></button>`;
    }).join('') || empty(activeTab === 'buildings' && (city || role || query) ? 'No buildings match these filters. Try another city, role, or search.' : 'No artwork in this collection yet.'));
  }

  async function refresh() {
    if (fetching) return;
    fetching = true;
    try {
      const response = await fetch(`data/progress.json?t=${Date.now()}`, {cache:'no-store',signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json();
      if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Invalid progress data');
      const changed = JSON.stringify(next) !== JSON.stringify(data);
      data = next;
      $('load-status').hidden = true;
      if (changed) {
        const scroll = {x:window.scrollX,y:window.scrollY};
        const focused = document.activeElement;
        const focusState = focused?.dataset ? {tab:focused.dataset.tab,filter:focused.dataset.filter,value:focused.dataset.value,comparison:focused.dataset.comparison,phase:focused.closest('[data-phase]')?.dataset.phase} : {};
        renderSummary();renderActivity();renderPoster();renderPhases();renderGallery();
        if (focused && !focused.isConnected) {
          const target = [...document.querySelectorAll('[data-tab],[data-filter],[data-comparison],[data-phase]')].find(el => focusState.tab ? el.dataset.tab === focusState.tab : focusState.filter ? el.dataset.filter === focusState.filter && el.dataset.value === focusState.value : focusState.comparison ? el.dataset.comparison === focusState.comparison : focusState.phase ? el.dataset.phase === focusState.phase : false);
          (target?.matches('details') ? target.querySelector('summary') : target)?.focus({preventScroll:true});
        }
        window.scrollTo(scroll.x,scroll.y);
      } else updateAge();
    } catch (error) {
      $('load-status').textContent = data ? 'The latest update could not be reached. Showing the last received progress; retrying automatically.' : 'Progress could not be loaded. Please check that data/progress.json is available. Retrying automatically.';
      $('load-status').hidden = false;
      if (!data) $('updated').textContent = 'Waiting for progress data';
    } finally {fetching = false;}
  }

  document.addEventListener('click', event => {
    const assetButton = event.target.closest('[data-image]');
    if (assetButton) {
      const asset = assets.get(assetButton.dataset.image);
      if (asset?.src) {
        $('lightbox-title').textContent = asset.title;
        // A fresh element cannot display the previous selection during loading.
        const preview = document.createElement('img');
        preview.id = 'lightbox-img';
        preview.alt = asset.title;
        preview.src = asset.src;
        $('lightbox-img').replaceWith(preview);
        $('lightbox-details').textContent = asset.details;
        lightbox.showModal();
      }
    }
    const tab = event.target.closest('[data-tab]');
    if (tab && data) {activeTab = tab.dataset.tab;renderGallery();$(`tab-${activeTab}`).focus({preventScroll:true});}
    const filter = event.target.closest('[data-filter]');
    if (filter && data) {
      if (filter.dataset.filter === 'city') city = filter.dataset.value; else role = filter.dataset.value;
      const field = filter.dataset.filter;
      const value = filter.dataset.value;
      renderGallery();
      [...document.querySelectorAll('[data-filter]')].find(el => el.dataset.filter === field && el.dataset.value === value)?.focus({preventScroll:true});
    }
  });
  $('gallery-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !data) return;
    event.preventDefault();
    let index = tabs.findIndex(([key]) => key === activeTab);
    index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activeTab = tabs[index][0];renderGallery();$(`tab-${activeTab}`).focus({preventScroll:true});
  });
  $('search').addEventListener('input', event => {query = event.target.value;if (data) renderGallery();});
  $('gallery-grid').addEventListener('input', event => {
    if (!event.target.matches('[data-comparison]')) return;
    const value = Number(event.target.value);
    comparisons.set(event.target.dataset.comparison,value);
    event.target.parentElement.style.setProperty('--split',`${value}%`);
    event.target.setAttribute('aria-valuetext',`${value}% before, ${100-value}% after`);
  });
  $('close-lightbox').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => {
    const box = lightbox.getBoundingClientRect();
    if (event.target === lightbox && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) lightbox.close();
  });
  // Native modal dialogs close with Escape and restore focus to their opener.
  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement) {
      event.target.style.opacity = '.5';
      event.target.title = 'Image currently unavailable';
    }
  },true);
  refresh();
  setInterval(refresh,60000);
  setInterval(updateAge,15000);
})();
