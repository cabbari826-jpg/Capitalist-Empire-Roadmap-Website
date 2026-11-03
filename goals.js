'use strict';
// Goals page: current work, read from data/goals.json (built from the site's goals list at each publish).
(() => {
  const $ = id => document.getElementById(id);
  const list = value => Array.isArray(value) ? value : [];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent = value => Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
  const known = value => ['done', 'in-progress', 'idea'].includes(value) ? value : 'todo';
  const chip = value => ({done:'Done','in-progress':'In progress',idea:'Idea',todo:'To do'})[known(value)];
  const icon = value => ({done:'✓','in-progress':'◐',idea:'·',todo:'○'})[known(value)];
  const dateLabel = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  };
  const goal = item => `<li class="phase-item"><span class="status-icon ${known(item.state)}" role="img" aria-label="${chip(item.state)}">${icon(item.state)}</span><div><p class="item-title">${escape(item.title)}</p>${item.detail ? `<p class="item-detail">${escape(item.detail)}</p>` : ''}${item.date ? `<div class="item-meta"><time datetime="${escape(item.date)}">${escape(dateLabel(item.date))}</time></div>` : ''}</div></li>`;
  const group = (phase, index) => {
    const value = percent(phase.progress), open = !(matchMedia('(max-width: 640px)').matches && phase.state === 'done');
    const ideas = phase.state === 'idea';
    return `<details class="phase ${known(phase.state)}"${open ? ' open' : ''}><summary><div class="phase-head"><span class="phase-number">${index + 1}</span><h3>${escape(phase.label)}</h3><span class="state-chip ${known(phase.state)}">${ideas ? 'Ideas' : chip(phase.state)}</span><span class="phase-chevron" aria-hidden="true">⌄</span></div>${ideas ? '' : `<div class="phase-progress"><div class="progress" role="progressbar" aria-label="${escape(phase.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%"></span></div><span>${value}%</span></div>`}</summary><ul class="phase-items">${list(phase.items).map(goal).join('')}</ul></details>`;
  };
  async function load() {
    try {
      const response = await fetch(`data/goals.json?t=${Date.now()}`, {cache:'no-store'});
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      const value = percent(data.progress);
      $('summary-text').innerHTML = `<strong>${escape(data.done)}</strong> of ${escape(data.total)} goals done`;
      $('updated').textContent = `Released game v${data.releasedVersion} · updated ${dateLabel(data.updated)}`;
      $('overall-progress').setAttribute('aria-valuenow', value);
      $('overall-progress').setAttribute('aria-valuetext', `${value}% complete`);
      $('overall-progress').firstElementChild.style.width = `${value}%`;
      $('goal-groups').innerHTML = list(data.groups).map(group).join('');
      const recent = list(data.groups).flatMap(phase => list(phase.items).filter(item => item.date).map(item => ({...item, phase:phase.label})))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
      $('completed').innerHTML = recent.map(item => `<article class="completion"><span class="check" aria-hidden="true">✓</span><div><p>${escape(item.title)}</p><small>${escape(item.phase)} · <time datetime="${escape(item.date)}">${escape(dateLabel(item.date))}</time></small></div></article>`).join('');
    } catch {
      $('summary-text').textContent = 'The goals are temporarily unavailable. Please try again.';
    }
  }
  load();
})();
