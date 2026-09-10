// Shared rendering keeps the static HTML and interactive month navigation identical.
const escape = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (key) => new Date(`${key}T12:00:00Z`);
const label = (key, options) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(date(key));
export const currentDateKey = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
export function monthMarkup(month, events, today) {
  const first = date(`${month}-01`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `<div class="custom-weekdays" aria-hidden="true">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => `<span>${day}</span>`).join('')}</div><div class="custom-days">${'<span aria-hidden="true"></span>'.repeat(first.getUTCDay())}${Array.from({ length: days }, (_, i) => {
    const key = `${month}-${String(i + 1).padStart(2, '0')}`;
    const matches = events.filter((event) => event.dateKey === key);
    return `<span class="custom-day${matches.length ? ' has-events' : ''}${key === today ? ' is-today' : ''}" ${key === today ? 'aria-current="date"' : ''} aria-label="${escape(label(key, { month: 'long', day: 'numeric' }))}${matches.length ? `, ${matches.length} event${matches.length === 1 ? '' : 's'}` : ''}">${i + 1}${matches.length ? '<i aria-hidden="true"></i>' : ''}</span>`;
  }).join('')}</div>`;
}
export function agendaMarkup(events, month, scope, today) {
  const matching = events.filter((event) => scope === 'upcoming' ? event.dateKey >= today : event.dateKey.startsWith(month));
  const displayed = scope === 'upcoming' ? matching.slice(0, 3) : matching;
  if (!displayed.length) return '<p class="custom-empty">No events listed for this period. Check Google Calendar for the latest schedule.</p>';
  return displayed.map((event) => `<article class="custom-event"><time datetime="${escape(event.dateKey)}"><span>${escape(label(event.dateKey, { month: 'short' }))}</span><strong>${Number(event.dateKey.slice(-2))}</strong></time><div><div class="custom-event-tags"><span>${escape(event.audience)}</span>${event.sample ? '<span class="sample-badge">Sample · not confirmed</span>' : ''}</div><h4>${escape(event.title.replace(/^\[SAMPLE\]\s*/, ''))}</h4><p>${escape(event.timeLabel || 'All day')} · ${escape(event.location)}</p><a href="${escape(event.actionUrl)}" target="_blank" rel="noopener noreferrer">${event.sample ? 'View calendar' : 'Open in Google Calendar'} <span aria-hidden="true">↗</span></a></div></article>`).join('');
}
export function renderCalendar({ id, title, events, scope = 'month', notice = '' }) {
  const today = currentDateKey();
  const month = today.slice(0, 7);
  const heading = label(`${month}-01`, { month: 'long', year: 'numeric' });
  const data = JSON.stringify({ events, scope, today }).replaceAll('<', '\\u003c');
  return `<section class="custom-calendar" data-custom-calendar data-month="${month}" aria-label="${escape(title)}"><div class="custom-calendar-month"><div class="custom-calendar-toolbar"><h3 id="${id}-month" data-month-title aria-live="polite">${heading}</h3><div data-month-controls hidden><button type="button" data-month-offset="-1" aria-label="Previous month">←</button><button type="button" data-month-today>Today</button><button type="button" data-month-offset="1" aria-label="Next month">→</button></div></div><div data-month-grid role="group" aria-labelledby="${id}-month">${monthMarkup(month, events, today)}</div><p class="custom-calendar-legend"><i aria-hidden="true"></i> Event scheduled <span>Times: New York</span></p></div><div class="custom-calendar-agenda"><p class="eyebrow eyebrow-dark">${scope === 'upcoming' ? 'Coming up next' : 'This month'}</p>${notice ? `<p class="custom-calendar-notice">${escape(notice)}</p>` : ''}<div data-calendar-agenda>${agendaMarkup(events, month, scope, today)}</div></div><script type="application/json" data-calendar-data>${data}</script></section>`;
}
if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-custom-calendar]').forEach((calendar) => {
    const { events, scope, today } = JSON.parse(calendar.querySelector('[data-calendar-data]').textContent);
    calendar.querySelector('[data-month-controls]').hidden = false;
    const render = (month) => {
      calendar.dataset.month = month;
      calendar.querySelector('[data-month-title]').textContent = label(`${month}-01`, { month: 'long', year: 'numeric' });
      calendar.querySelector('[data-month-grid]').innerHTML = monthMarkup(month, events, today);
      calendar.querySelector('[data-calendar-agenda]').innerHTML = agendaMarkup(events, month, scope, today);
    };
    calendar.querySelectorAll('[data-month-offset]').forEach((button) => button.addEventListener('click', () => {
      const next = date(`${calendar.dataset.month}-01`);
      next.setUTCMonth(next.getUTCMonth() + Number(button.dataset.monthOffset));
      render(next.toISOString().slice(0, 7));
    }));
    calendar.querySelector('[data-month-today]').addEventListener('click', () => render(today.slice(0, 7)));
  });
}
