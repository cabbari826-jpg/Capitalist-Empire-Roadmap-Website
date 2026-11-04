'use strict';
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list = value => Array.isArray(value) ? value : [];
  const bullets = items => `<ul>${list(items).map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  const planItem = item => `<li class="plan-item"><div><p class="plan-title">${escape(item.title)}</p>${item.detail ? `<p class="plan-detail">${escape(item.detail)}</p>` : ''}</div><span class="plan-chip ${item.state === 'idea' ? 'idea' : ''}">${item.state === 'idea' ? 'Idea' : 'Planned'}</span></li>`;
  const marker = i => `<div class="plan-marker">${String(i+1).padStart(2,'0')}</div>`;
  const futurePlans = () => fetch(`data/goals.json?t=${Date.now()}`, {cache:'no-store'}).then(r => r.ok ? r.json() : null).then(data => list(data?.plans)).catch(() => []);
  const target = document.getElementById('roadmap-content') || document.getElementById('release-content') || document.getElementById('latest-release');
  async function load() {
    try {
      const response = await fetch(`data/game.json?t=${Date.now()}`, {cache:'no-store'});
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (target.id === 'roadmap-content') {
        document.getElementById('notes-notice').textContent = data.notice || 'Plans may change; future features are not release promises.';
        const plans = await futurePlans();
        const sections = list(data.roadmap).filter(section => !plans.length || section.status !== 'Future plans');
        const future = plans.length ? `<section id="future-plans" class="future-plans" aria-labelledby="future-heading"><div class="section-heading"><h2 id="future-heading">Future plans</h2><span class="section-note">NO DATES YET</span></div><p class="future-note">Planned means it is on our list. Idea means we like it but have not decided.</p>${plans.map((group,i) => `<article class="plan-card">${marker(sections.length+i)}<div><span class="plan-status">Future plans</span><h2>${escape(group.label)}</h2><ul class="plan-list">${list(group.items).map(planItem).join('')}</ul></div></article>`).join('')}</section>` : '';
        target.innerHTML = sections.map((section,i) => `<article class="plan-card">${marker(i)}<div><span class="plan-status ${section.status === 'Available now' ? 'available' : ''}">${escape(section.status)}</span><h2>${escape(section.title)}</h2>${bullets(section.items)}</div></article>`).join('') + future || '<p>No roadmap updates yet. Please check back soon.</p>';
        if (location.hash === '#future-plans') document.getElementById('future-plans')?.scrollIntoView();
      } else if (target.id === 'release-content') {
        target.innerHTML = list(data.releases).map((release,i) => `<article class="release"><div class="release-meta"><span class="version">v${escape(release.version)}</span>${i === 0 ? '<span class="latest-label">LATEST UPDATE</span>' : ''}</div><div><h2>${escape(release.title)}</h2>${bullets(release.changes)}</div></article>`).join('') || '<p>No updates posted yet. Please check back soon.</p>';
      } else {
        const release = list(data.releases)[0];
        target.innerHTML = release ? `<span class="version">v${escape(release.version)}</span><h3>${escape(release.title)}</h3><p>${escape(list(release.changes)[0])}</p>` : '<p>Updates will appear here as the game grows.</p>';
      }
    } catch {
      target.replaceChildren();
      const message = document.createElement('p');
      message.textContent = 'The latest notes are temporarily unavailable. Please try again.';
      const retry = document.createElement('button');
      retry.className = 'primary-button'; retry.textContent = 'Try again'; retry.addEventListener('click',load);
      target.append(message,retry);
    }
  }
  load();
})();
