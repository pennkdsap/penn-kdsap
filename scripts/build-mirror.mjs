import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { siFacebook, siInstagram } from 'simple-icons';

const root = process.cwd();
const sourceDirectory = join(root, 'site-html-archive/pages');
const outputDirectory = join(root, 'dist');
const deploymentBase = '/penn-kdsap';
const publicSiteUrl = 'https://akashdubey.me';
const ogImageUrl = 'https://akashdubey.me/penn-kdsap/images/penn-kdsap-og.png';
const pages = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.html'));
const homeTemplate = await readFile(join(root, 'content/home-page.html'), 'utf8');
const homeContent = JSON.parse(await readFile(join(root, 'content/home.json'), 'utf8'));
const nativeTemplate = await readFile(join(root, 'content/native-page.html'), 'utf8');
const nativeFiles = {
  'about.html': 'about',
  'kidney-screenings.html': 'screenings',
  'kdsap.html': 'students',
  'calendar.html': 'events',
  'health-education.html': 'resources',
  'meet-the-team.html': 'team',
  'partners.html': 'partners',
  'contact-us.html': 'contact',
  'news.html': 'stories',
  'gallery.html': 'gallery',
};
const nativeContent = Object.fromEntries(await Promise.all(Object.values(nativeFiles).map(async (name) => [
  name,
  JSON.parse(await readFile(join(root, 'content/pages', `${name}.json`), 'utf8')),
])));
const unescapeIcsText = (value = '') => value
  .replaceAll('\\n', ' ')
  .replaceAll('\\N', ' ')
  .replaceAll('\\,', ',')
  .replaceAll('\\;', ';')
  .replaceAll('\\\\', '\\');
const inferEventType = (title, categories = '') => {
  const value = `${categories} ${title}`.toLowerCase();
  if (value.includes('screen')) return 'Screening';
  if (value.includes('train')) return 'Training';
  if (value.includes('workshop') || value.includes('education')) return 'Education';
  return 'Public event';
};
const parseIcsDate = (value = '') => {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '12', minute = '00', second = '00', utc] = match;
  const allDay = !value.includes('T');
  const timestamp = utc
    ? Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)
    : Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  return {
    date: new Date(timestamp),
    dateKey: `${year}-${month}-${day}`,
    allDay,
    timeLabel: allDay ? '' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(timestamp)),
  };
};
const parseCalendarFeed = (source) => {
  const unfolded = source.replace(/\r?\n[ \t]/g, '');
  return [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)].map((match) => {
    const properties = {};
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const key = line.slice(0, separator).split(';')[0];
      if (!(key in properties)) properties[key] = line.slice(separator + 1);
    }
    const start = parseIcsDate(properties.DTSTART);
    if (!start || properties.STATUS === 'CANCELLED') return null;
    const title = unescapeIcsText(properties.SUMMARY || 'Public event');
    return {
      ...start,
      title,
      type: inferEventType(title, properties.CATEGORIES),
      location: unescapeIcsText(properties.LOCATION || 'Location to be announced'),
      actionLabel: 'Open public calendar',
      actionUrl: nativeContent.events.publicCalendarUrl,
    };
  }).filter(Boolean).sort((a, b) => a.date - b.date);
};
const loadPublicCalendarEvents = async () => {
  const { calendarFeedUrl, upcomingEvents = [] } = nativeContent.events;
  if (calendarFeedUrl) {
    try {
      const response = await fetch(calendarFeedUrl, { headers: { 'user-agent': 'Penn-KDSAP-site-builder/1.0' } });
      if (!response.ok) throw new Error(`Calendar feed returned ${response.status}`);
      const events = parseCalendarFeed(await response.text());
      if (events.length) return events;
    } catch (error) {
      console.warn(`Calendar feed unavailable; using CMS fallback events. ${error.message}`);
    }
  }
  return upcomingEvents.map((item) => {
    const source = String(item.start || '');
    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(source);
    const date = new Date(allDay ? `${source}T12:00:00Z` : source);
    if (Number.isNaN(date.getTime())) return null;
    return {
      ...item,
      date,
      dateKey: source.slice(0, 10),
      allDay,
      timeLabel: allDay ? '' : new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: nativeContent.events.calendarTimeZone || 'America/New_York',
      }).format(date),
    };
  }).filter(Boolean).sort((a, b) => a.date - b.date);
};
const publicCalendarEvents = await loadPublicCalendarEvents();
const today = new Date();
today.setHours(0, 0, 0, 0);
const eventWindowEnd = new Date(today);
eventWindowEnd.setDate(eventWindowEnd.getDate() + Number(nativeContent.events.calendarWindowDays || 60));
const featuredCalendarEvents = publicCalendarEvents.filter((event) => event.date >= today && event.date <= eventWindowEnd);
const eventMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const eventLongMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const renderEventCard = (item, className = 'quick-event') => `<article class="${className}"><time datetime="${escapeHtml(item.dateKey)}"><span>${escapeHtml(eventMonthFormatter.format(item.date))}</span><strong>${escapeHtml(item.date.getUTCDate())}</strong></time><div><p>${escapeHtml(item.type)}</p><h3>${escapeHtml(item.title)}</h3><span>${escapeHtml(`${item.timeLabel ? `${item.timeLabel} · ` : ''}${item.location}`)}</span>${item.actionUrl ? `<a class="text-link" href="${escapeHtml(item.actionUrl)}">${escapeHtml(item.actionLabel)}</a>` : ''}</div></article>`;
const addMonths = (date, amount) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
const calendarStartMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
const calendarMonths = Array.from({ length: 3 }, (_, index) => addMonths(calendarStartMonth, index));
const calendarRangeEnd = addMonths(calendarStartMonth, 3);
const calendarAgendaEvents = publicCalendarEvents.filter((event) => event.date >= today && event.date < calendarRangeEnd);
const renderCalendarMonth = (monthDate) => {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingDays = monthDate.getUTCDay();
  const cells = Array.from({ length: leadingDays }, () => '<span class="calendar-day is-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= dayCount; day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = publicCalendarEvents.filter((event) => event.dateKey === dateKey);
    cells.push(`<div class="calendar-day${events.length ? ' has-events' : ''}"><time datetime="${dateKey}">${day}</time>${events.map((event) => `<span class="calendar-event-marker" aria-label="${escapeHtml(event.title)}" title="${escapeHtml(event.title)}"></span>`).join('')}</div>`);
  }
  return `<section class="calendar-month" aria-label="${escapeHtml(eventLongMonthFormatter.format(monthDate))}"><h3>${escapeHtml(eventLongMonthFormatter.format(monthDate))}</h3><div class="calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="calendar-days">${cells.join('')}</div></section>`;
};
const redirects = {
  'about-1.html': 'health-education',
  'about-3.html': 'news',
  'alumni.html': 'meet-the-team',
  'blank-12.html': 'meet-the-team',
  'chronic-kidney-disease.html': 'health-education',
  'copy-of-2024-year-in-review.html': 'news',
  'copy-of-student-development.html': 'kdsap',
  'student-development.html': 'kdsap',
  'the-student-council.html': 'meet-the-team',
  'what-we-do.html': 'kidney-screenings',
};
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const assetPath = (value) => String(value).replace(/^\/+/, '');
const socialIcons = { facebook: siFacebook, instagram: siInstagram };
const renderLinks = (links) => links
  .map(({ label, url }) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`)
  .join('\n          ');
const renderPrefixedLinks = (links) => links
  .map(({ label, url }) => `<a href="../${escapeHtml(String(url).replace(/^\/+/, ''))}">${escapeHtml(label)}</a>`)
  .join('\n          ');
const navigation = renderLinks(homeContent.navigation);
const heroSlides = homeContent.hero.slides.map((slide, index) => {
  const desktopPosition = slide.desktopPosition || 'center center';
  const mobilePosition = slide.mobilePosition || 'center center';
  return `<picture class="hero-slide${index === 0 ? ' is-active' : ''}" data-hero-slide aria-hidden="${index === 0 ? 'false' : 'true'}" style="--hero-desktop-position:${escapeHtml(desktopPosition)};--hero-mobile-position:${escapeHtml(mobilePosition)}"><source media="(max-width: 640px)" srcset="${escapeHtml(assetPath(slide.mobileImage))}"><img src="${escapeHtml(assetPath(slide.desktopImage))}" alt="${escapeHtml(slide.imageAlt)}" width="1800" height="1200" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></picture>`;
}).join('');
const heroSlideDots = homeContent.hero.slides.map((_, index) => `<button type="button" class="hero-slide-dot${index === 0 ? ' is-active' : ''}" data-hero-dot="${index}" aria-label="${escapeHtml(homeContent.hero.showSlideLabel.replace('{number}', String(index + 1)))}" aria-current="${index === 0 ? 'true' : 'false'}"><span></span></button>`).join('');
const renderSocialLinks = () => homeContent.footer.socialLinks.map((link) => {
  const key = String(link.network).toLowerCase();
  const icon = socialIcons[key];
  if (!icon) throw new Error(`Unsupported footer social network: ${link.network}`);
  return `<a class="social-link social-link-${escapeHtml(key)}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(link.label)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${icon.path}"></path></svg></a>`;
}).join('');
const footerAffiliation = (prefix = '') => `<div class="footer-affiliation"><a class="footer-university" href="${escapeHtml(homeContent.footer.universityUrl)}" target="_blank" rel="noopener"><img src="${prefix}${escapeHtml(assetPath(homeContent.footer.universityLogo))}" alt="${escapeHtml(homeContent.footer.universityLogoAlt)}" width="2500" height="1500" loading="lazy"></a><p>${escapeHtml(homeContent.footer.affiliation)}</p></div>`;
const pathwayItems = homeContent.pathways.items.map((item) => `
            <article class="path-card">
              <span class="path-number" aria-hidden="true">${escapeHtml(item.number)}</span>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.text)}</p>
              <a href="${escapeHtml(item.actionUrl)}">${escapeHtml(item.actionLabel)} <span aria-hidden="true">→</span></a>
            </article>`).join('');
const photoReelImages = [...homeContent.photoReel.images, ...homeContent.photoReel.images]
  .map((item, index) => `<figure class="photo-reel-item"${index >= homeContent.photoReel.images.length ? ' aria-hidden="true"' : ''}><img src="${escapeHtml(assetPath(item.image))}" alt="${index >= homeContent.photoReel.images.length ? '' : escapeHtml(item.alt)}" width="900" height="675" loading="lazy"></figure>`)
  .join('\n          ');
const impactItems = homeContent.impact.items.map((item) => `
            <article class="impact-item">
              <strong>${escapeHtml(item.value)}</strong>
              <p>${escapeHtml(item.label)}</p>
            </article>`).join('');
const coordinate = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const mapPins = homeContent.communityMap.pins.map((pin, index) => `<span data-map-pin="${index}" data-latitude="${coordinate(pin.latitude)}" data-longitude="${coordinate(pin.longitude)}" data-name="${escapeHtml(pin.name)}" data-address="${escapeHtml(pin.address)}" data-date="${escapeHtml(pin.date)}" data-label="${escapeHtml(`${homeContent.communityMap.pinLabel}: ${pin.name}`)}"></span>`).join('');
const mapSiteItems = homeContent.communityMap.pins.map((pin, index) => `<li data-map-site="${index}"><button type="button" data-map-site-button="${index}"><span>${index + 1}</span><span><strong>${escapeHtml(pin.name)}</strong><small>${escapeHtml(pin.address)}</small><small>${escapeHtml(pin.date)}</small></span></button></li>`).join('');
const eventItems = featuredCalendarEvents.length
  ? featuredCalendarEvents.slice(0, 3).map((item) => renderEventCard(item)).join('')
  : `<div class="events-empty"><span aria-hidden="true">—</span><h3>${escapeHtml(homeContent.quickEvents.emptyTitle)}</h3><p>${escapeHtml(homeContent.quickEvents.emptyText)}</p></div>`;
const storyItems = homeContent.stories.items.map((item, index) => `
            <figure class="story${index === 0 ? ' story-large' : ''}">
              <img src="${escapeHtml(assetPath(item.image))}" alt="${escapeHtml(item.imageAlt)}" width="1400" height="933" loading="lazy">
              <figcaption>${escapeHtml(item.caption)}</figcaption>
            </figure>`).join('');
const renderInfoCards = (items, className = 'info-card') => items.map((item, index) => `
          <article class="${className}">
            ${item.number ? `<span class="card-number" aria-hidden="true">${escapeHtml(item.number)}</span>` : ''}
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text)}</p>
            ${item.actionLabel ? `<a class="text-link" href="${escapeHtml(item.actionUrl)}">${escapeHtml(item.actionLabel)} <span aria-hidden="true">→</span></a>` : ''}
          </article>`).join('');
const journeyIcons = {
  clipboard: '<rect x="8" y="7" width="20" height="25" rx="3"/><path d="M13 7V4h10v3M13 15h10M13 21h10M13 27h7"/>',
  history: '<circle cx="18" cy="18" r="13"/><path d="M18 10v9l6 4M8 7l-2 7 7-1"/>',
  pressure: '<path d="M7 11h15a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5H7zM27 18h4v11M12 16v7M17 14v9"/>',
  scale: '<path d="M7 30h22L27 9H9z"/><path d="M13 15a6 6 0 0 1 10 0M18 15l3-4"/>',
  urine: '<path d="M12 5h12v5l3 5v14a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V15l3-5zM9 20h18"/>',
  glucose: '<path d="M18 4c5 7 10 12 10 19a10 10 0 0 1-20 0c0-7 5-12 10-19z"/><path d="M13 24a5 5 0 0 0 5 4"/>',
  education: '<path d="M5 8h11a5 5 0 0 1 5 5v18a6 6 0 0 0-6-6H5zM31 8H20M31 8v17H21M10 14h6M10 19h6"/>',
  doctor: '<circle cx="18" cy="11" r="6"/><path d="M7 32c1-8 5-12 11-12s10 4 11 12M11 23v5h14v-5"/>',
};
const renderJourneySvg = (data, mobile = false) => {
  const desktopPositions = [[90, 110], [360, 110], [630, 110], [900, 110], [1110, 330], [840, 330], [570, 330], [300, 330]];
  const positions = mobile ? data.journeySteps.map((_, index) => [70, 70 + (index * 126)]) : desktopPositions;
  const route = mobile ? 'M70 70V952' : 'M90 110H900C1010 110 1110 205 1110 330H300';
  const mode = mobile ? 'mobile' : 'desktop';
  const nodes = data.journeySteps.map((step, index) => {
    const [x, y] = positions[index] || positions[positions.length - 1];
    return `<g class="journey-node" style="--journey-delay:${index * 0.16}s" transform="translate(${x} ${y})"><circle class="journey-node-halo" r="42"/><circle class="journey-node-disc" r="32"/><g class="journey-icon" transform="translate(-18 -18)">${journeyIcons[step.icon] || journeyIcons.clipboard}</g><text x="0" y="58" text-anchor="middle">${escapeHtml(step.number)}</text></g>`;
  }).join('');
  return `<svg class="journey-graphic journey-graphic-${mode}" viewBox="0 0 ${mobile ? '420 1020' : '1200 440'}" role="img" aria-labelledby="journey-${mode}-title journey-${mode}-description"><title id="journey-${mode}-title">${escapeHtml(data.journeyGraphicTitle)}</title><desc id="journey-${mode}-description">${escapeHtml(data.journeyGraphicDescription)}</desc><path class="journey-route-shadow" d="${route}"/><path class="journey-route" d="${route}"/>${nodes}<g class="journey-kidneys" transform="translate(${mobile ? '255 475' : '1050 200'})"><path class="journey-kidney" transform="translate(-34 -3) rotate(-8)" d="M0-45C-24-47-40-28-40-2c0 28 17 46 37 42 15-3 19-18 11-29C1 2 2-6 10-17c8-12 1-25-10-28Z"/><path class="journey-kidney" transform="translate(34 3) rotate(8)" d="M0-45C24-47 40-28 40-2c0 28-17 46-37 42-15-3-19-18-11-29 7-9 6-17-2-28-8-12-1-25 10-28Z"/><path class="journey-ureter" d="M-25 9C-24 34-15 54-5 68M25 12C24 36 15 55 5 68"/><path class="journey-bladder" d="M-12 66C-8 62 8 62 12 66v8C12 84 5 90 0 90s-12-6-12-16Z"/><path class="journey-ureter" d="M0 90v9"/></g></svg>`;
};
const renderNativeBody = (name, data) => {
  if (name === 'about') return data.sections.map((section, index) => `
      <section class="interior-section${index % 2 ? ' section-tint' : ''}" data-reveal>
        <div class="shell prose-feature">
          <p class="eyebrow eyebrow-dark">${escapeHtml(section.eyebrow)}</p>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.text)}</p>
        </div>
      </section>`).join('');
  if (name === 'screenings') return `
      <section class="interior-section screening-journey" data-reveal>
        <div class="shell">
          <div class="section-heading journey-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.journeyEyebrow)}</p><h2>${escapeHtml(data.journeyTitle)}</h2><p>${escapeHtml(data.journeyIntroduction)}</p></div>
          <div class="journey-visual" aria-hidden="false">
            ${renderJourneySvg(data)}
            ${renderJourneySvg(data, true)}
          </div>
          <div class="journey-detail-grid">
            ${data.journeySteps.map((step) => `<article class="journey-detail"><span>${escapeHtml(step.number)}</span><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></article>`).join('')}
          </div>
          <p class="medical-note journey-disclaimer">${escapeHtml(data.journeyDisclaimer)}</p>
        </div>
      </section>
      <section class="interior-section section-tint" data-reveal>
        <div class="shell">
          <div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.sectionEyebrow)}</p><h2>${escapeHtml(data.sectionTitle)}</h2><p>${escapeHtml(data.sectionText)}</p></div>
          <div class="info-grid four-up">${renderInfoCards(data.steps, 'info-card step-card')}</div>
          <a class="button button-dark section-action" href="${escapeHtml(data.actionUrl)}">${escapeHtml(data.actionLabel)}</a>
        </div>
      </section>`;
  if (name === 'students') return `
      <section class="interior-section" data-reveal>
        <div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.sectionEyebrow)}</p><h2>${escapeHtml(data.sectionTitle)}</h2></div>
          <div class="info-grid">${renderInfoCards(data.objectives)}</div>
          <a class="button button-dark section-action" href="${escapeHtml(data.actionUrl)}">${escapeHtml(data.actionLabel)}</a>
        </div>
      </section>`;
  if (name === 'events') {
    const agenda = calendarAgendaEvents.length
      ? `<div class="events-agenda">${calendarAgendaEvents.map((item) => renderEventCard(item, 'calendar-agenda-event')).join('')}</div>`
      : `<div class="event-empty"><p class="eyebrow eyebrow-dark">${escapeHtml(data.emptyEyebrow)}</p><h2>${escapeHtml(data.emptyTitle)}</h2><p>${escapeHtml(data.emptyText)}</p>${data.publicCalendarUrl ? `<a class="button button-dark" href="${escapeHtml(data.publicCalendarUrl)}">${escapeHtml(data.calendarActionLabel)}</a>` : `<a class="button button-dark" href="${escapeHtml(data.contactActionUrl)}">${escapeHtml(data.contactActionLabel)}</a>`}</div>`;
    const months = calendarMonths.map(renderCalendarMonth).join('');
    return `<section class="interior-section calendar-section" data-reveal><div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.calendarEyebrow)}</p><h2>${escapeHtml(data.calendarTitle)}</h2><p>${escapeHtml(data.calendarIntroduction)}</p></div><p class="sample-event-notice">${escapeHtml(data.sampleEventNotice)}</p><div class="calendar-months">${months}</div><div class="events-layout calendar-agenda-layout">${agenda}<aside class="privacy-panel"><h2>${escapeHtml(data.memberTitle)}</h2><p>${escapeHtml(data.memberText)}</p>${data.publicCalendarUrl ? `<a class="text-link text-link-light" href="${escapeHtml(data.publicCalendarUrl)}">${escapeHtml(data.calendarActionLabel)}</a>` : ''}</aside></div></div></section>`;
  }
  if (name === 'resources') return `
      <section class="interior-section" data-reveal><div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.sectionEyebrow)}</p><h2>${escapeHtml(data.sectionTitle)}</h2><p>${escapeHtml(data.sectionText)}</p></div><div class="info-grid">${renderInfoCards(data.initiatives)}</div><p class="medical-note">${escapeHtml(data.disclaimer)}</p></div></section>`;
  if (name === 'team') {
    const people = data.people.filter((person) => person.active).map((person) => `
          <article class="person-card">
            <img src="../${escapeHtml(assetPath(person.image))}" alt="${escapeHtml(person.imageAlt)}" width="800" height="1200" loading="lazy">
            <div><p>${escapeHtml(person.group)}</p><h3>${escapeHtml(person.name)}</h3><span>${escapeHtml(person.role)}</span></div>
          </article>`).join('');
    return `<section class="interior-section" data-reveal><div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.boardEyebrow)}</p><h2>${escapeHtml(data.boardTitle)}</h2><p>${escapeHtml(data.boardIntroduction)}</p></div><div class="people-grid">${people}</div></div></section>`;
  }
  if (name === 'partners') {
    const partners = data.partners.map((partner) => `<article class="partner-card">${partner.image ? `<img src="../${escapeHtml(assetPath(partner.image))}" alt="${escapeHtml(partner.imageAlt)}" loading="lazy">` : '<span class="partner-mark" aria-hidden="true">P</span>'}<h3>${escapeHtml(partner.name)}</h3></article>`).join('');
    return `<section class="interior-section" data-reveal><div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.sectionEyebrow)}</p><h2>${escapeHtml(data.sectionTitle)}</h2></div><div class="partner-grid">${partners}</div></div></section>`;
  }
  if (name === 'stories') return `<section class="interior-section" data-reveal><div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.sectionEyebrow)}</p><h2>${escapeHtml(data.sectionTitle)}</h2></div><div class="info-grid">${renderInfoCards(data.items)}</div></div></section>`;
  if (name === 'gallery') {
    const images = data.images.map((item, index) => `<figure class="gallery-card"><a href="../${escapeHtml(assetPath(item.image))}" target="_blank" rel="noopener" aria-label="${escapeHtml(`${data.openImageLabel} ${index + 1}: ${item.caption}`)}"><img src="../${escapeHtml(assetPath(item.image))}" alt="${escapeHtml(item.alt)}" width="900" height="675" loading="${index < 3 ? 'eager' : 'lazy'}"></a><figcaption>${escapeHtml(item.caption)}</figcaption></figure>`).join('');
    return `<section class="interior-section" data-reveal><div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.sectionEyebrow)}</p><h2>${escapeHtml(data.sectionTitle)}</h2><p>${escapeHtml(data.sectionText)}</p></div><div class="native-gallery" aria-label="${escapeHtml(data.galleryLabel)}">${images}</div></div></section>`;
  }
  if (name === 'contact') {
    const options = (items) => items.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    return `<section class="interior-section" data-reveal><div class="shell contact-layout"><div><p class="eyebrow eyebrow-dark">${escapeHtml(data.formEyebrow)}</p><h2>${escapeHtml(data.formTitle)}</h2><p>${escapeHtml(data.formIntroduction)}</p><a class="text-link" href="mailto:${escapeHtml(data.emailAddress)}">${escapeHtml(data.emailActionLabel)}</a></div><form class="contact-form" data-contact-form data-endpoint="${escapeHtml(data.formEndpoint)}" data-success-message="${escapeHtml(data.successMessage)}" data-error-message="${escapeHtml(data.errorMessage)}"><label>${escapeHtml(data.topicLabel)}<select name="topic" required><option value=""></option>${options(data.topicOptions)}</select></label><label>${escapeHtml(data.audienceLabel)}<select name="audience" required><option value=""></option>${options(data.audienceOptions)}</select></label><div class="form-row"><label>${escapeHtml(data.nameLabel)}<input name="name" autocomplete="name" required></label><label>${escapeHtml(data.emailLabel)}<input type="email" name="email" autocomplete="email" required></label></div><div class="form-row"><label>${escapeHtml(data.phoneLabel)}<input type="tel" name="phone" autocomplete="tel"></label><label>${escapeHtml(data.organizationLabel)}<input name="organization" autocomplete="organization"></label></div><div class="form-row"><label>${escapeHtml(data.preferredDateLabel)}<input type="date" name="preferred_date"></label><label>${escapeHtml(data.neighborhoodLabel)}<input name="neighborhood"></label></div><label>${escapeHtml(data.messageLabel)}<textarea name="message" rows="7" required></textarea></label><p class="privacy-warning">${escapeHtml(data.privacyWarning)}</p><button class="button button-dark" type="submit"${data.formEndpoint ? '' : ' disabled'}>${escapeHtml(data.submitLabel)}</button><p class="form-status" data-form-status aria-live="polite">${data.formEndpoint ? '' : escapeHtml(data.unavailableMessage)}</p></form></div></section>`;
  }
  throw new Error(`Unknown native page type: ${name}`);
};
const renderNativePage = (name, data) => nativeTemplate
  .replaceAll('{{PAGE_TITLE}}', escapeHtml(data.pageTitle))
  .replaceAll('{{META_DESCRIPTION}}', escapeHtml(data.metaDescription))
  .replaceAll('{{SITE_NAME}}', escapeHtml(homeContent.siteName))
  .replaceAll('{{SKIP_LINK_TEXT}}', escapeHtml(homeContent.skipLinkText))
  .replaceAll('{{BRAND_ALT}}', escapeHtml(homeContent.brandAlt))
  .replaceAll('{{PRIMARY_NAVIGATION_LABEL}}', escapeHtml(homeContent.primaryNavigationLabel))
  .replaceAll('{{MENU_LABEL}}', escapeHtml(homeContent.menuLabel))
  .replaceAll('{{NAVIGATION}}', renderPrefixedLinks(homeContent.navigation))
  .replaceAll('{{HEADER_ACTION_LABEL}}', escapeHtml(homeContent.headerAction.label))
  .replaceAll('{{HEADER_ACTION_URL}}', escapeHtml(homeContent.headerAction.url))
  .replaceAll('{{HERO_IMAGE}}', escapeHtml(assetPath(data.heroImage)))
  .replaceAll('{{HERO_IMAGE_ALT}}', escapeHtml(data.heroImageAlt))
  .replaceAll('{{HERO_EYEBROW}}', escapeHtml(data.eyebrow))
  .replaceAll('{{HERO_TITLE}}', escapeHtml(data.title))
  .replaceAll('{{HERO_SUMMARY}}', escapeHtml(data.summary))
  .replaceAll('{{PAGE_BODY}}', renderNativeBody(name, data))
  .replaceAll('{{CONTACT_EYEBROW}}', escapeHtml(homeContent.contact.eyebrow))
  .replaceAll('{{CONTACT_TITLE}}', escapeHtml(homeContent.contact.title))
  .replaceAll('{{CONTACT_TEXT}}', escapeHtml(homeContent.contact.text))
  .replaceAll('{{CONTACT_ACTION_URL}}', escapeHtml(homeContent.contact.actionUrl))
  .replaceAll('{{CONTACT_ACTION_LABEL}}', escapeHtml(homeContent.contact.actionLabel))
  .replaceAll('{{FOOTER_DESCRIPTION}}', escapeHtml(homeContent.footer.description))
  .replaceAll('{{FOOTER_EXPLORE_HEADING}}', escapeHtml(homeContent.footer.exploreHeading))
  .replaceAll('{{FOOTER_EXPLORE_LINKS}}', renderPrefixedLinks(homeContent.footer.exploreLinks))
  .replaceAll('{{FOOTER_CONNECT_HEADING}}', escapeHtml(homeContent.footer.connectHeading))
  .replaceAll('{{FOOTER_CONNECT_LINKS}}', renderPrefixedLinks(homeContent.footer.connectLinks))
  .replaceAll('{{FOOTER_SOCIAL_HEADING}}', escapeHtml(homeContent.footer.socialHeading))
  .replaceAll('{{FOOTER_SOCIAL_LINKS}}', renderSocialLinks())
  .replaceAll('{{FOOTER_AFFILIATION_BLOCK}}', footerAffiliation('../'))
  .replaceAll('{{FOOTER_DARK_MODE_LABEL}}', escapeHtml(homeContent.footer.darkModeLabel))
  .replaceAll('{{FOOTER_LIGHT_MODE_LABEL}}', escapeHtml(homeContent.footer.lightModeLabel))
  .replaceAll('{{FOOTER_COPYRIGHT}}', escapeHtml(homeContent.footer.copyright))
  .replaceAll('{{FOOTER_AFFILIATION}}', escapeHtml(homeContent.footer.affiliation))
  .replaceAll('{{CURRENT_YEAR}}', String(new Date().getFullYear()));
const renderRedirect = (target) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(homeContent.redirectPage.pageTitle)}</title><meta http-equiv="refresh" content="0; url=../${escapeHtml(target)}/"><link rel="canonical" href="${publicSiteUrl}${deploymentBase}/${escapeHtml(target)}/"></head><body><p>${escapeHtml(homeContent.redirectPage.message)}</p><a href="../${escapeHtml(target)}/">${escapeHtml(homeContent.redirectPage.actionLabel)}</a></body></html>`;
const localizeWixMedia = (html) => html
  .replace(/https:\/\/static\.wixstatic\.com\/media\/([^\/"')?]+)(?:\/v1\/[^"')?\s<]+)?/g, (_, name) => `${deploymentBase}/images/wix/${decodeURIComponent(name)}`)
  .replace(/https:\\\/\\\/static\.wixstatic\.com\\\/media\\\/([^\\\/"')?]+)(?:\\\/v1\\\/[^\\"')?\s<]+)?/g, (_, name) => `${deploymentBase}/images/wix/${decodeURIComponent(name)}`);
const setShareImage = (html) => html
  .replace(/(<meta property="og:image" content=")[^"]+("\/>)/g, `$1${ogImageUrl}$2`)
  .replace(/(<meta property="og:image:width" content=")[^"]+("\/>)/g, (_, start, end) => `${start}1200${end}`)
  .replace(/(<meta property="og:image:height" content=")[^"]+("\/>)/g, (_, start, end) => `${start}630${end}`)
  .replace(/(<meta name="twitter:image" content=")[^"]+("\/>)/g, `$1${ogImageUrl}$2`);
const setSeoUrls = (html, pagePath) => {
  const canonicalUrl = `${publicSiteUrl}${deploymentBase}${pagePath}`;
  const canonical = `<link rel="canonical" href="${canonicalUrl}"/>`;
  const openGraphUrl = `<meta property="og:url" content="${canonicalUrl}"/>`;
  const hasCanonical = /<link rel="canonical"/i.test(html);
  const hasOpenGraphUrl = /<meta property="og:url"/i.test(html);

  return html
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?\s*>/i, canonical)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?\s*>/i, openGraphUrl)
    .replace('</head>', `${hasOpenGraphUrl ? '' : openGraphUrl}<meta name="robots" content="index,follow"/>${hasCanonical ? '' : canonical}</head>`);
};
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const page of pages) {
  let html = page === 'index.html'
    ? homeTemplate
      .replaceAll('{{PAGE_TITLE}}', escapeHtml(homeContent.pageTitle))
      .replaceAll('{{META_DESCRIPTION}}', escapeHtml(homeContent.metaDescription))
      .replaceAll('{{SITE_NAME}}', escapeHtml(homeContent.siteName))
      .replaceAll('{{SKIP_LINK_TEXT}}', escapeHtml(homeContent.skipLinkText))
      .replaceAll('{{BRAND_ALT}}', escapeHtml(homeContent.brandAlt))
      .replaceAll('{{PRIMARY_NAVIGATION_LABEL}}', escapeHtml(homeContent.primaryNavigationLabel))
      .replaceAll('{{MENU_LABEL}}', escapeHtml(homeContent.menuLabel))
      .replaceAll('{{NAVIGATION}}', navigation)
      .replaceAll('{{HEADER_ACTION_LABEL}}', escapeHtml(homeContent.headerAction.label))
      .replaceAll('{{HEADER_ACTION_URL}}', escapeHtml(homeContent.headerAction.url))
      .replaceAll('{{HERO_DESKTOP_PRELOAD}}', escapeHtml(assetPath(homeContent.hero.slides[0].desktopImage)))
      .replaceAll('{{HERO_MOBILE_PRELOAD}}', escapeHtml(assetPath(homeContent.hero.slides[0].mobileImage)))
      .replaceAll('{{HERO_SLIDES}}', heroSlides)
      .replaceAll('{{HERO_SLIDE_DOTS}}', heroSlideDots)
      .replaceAll('{{HERO_ROTATION_INTERVAL}}', String(homeContent.hero.rotationInterval))
      .replaceAll('{{HERO_SLIDE_PICKER_LABEL}}', escapeHtml(homeContent.hero.slidePickerLabel))
      .replaceAll('{{HERO_PAUSE_LABEL}}', escapeHtml(homeContent.hero.pauseLabel))
      .replaceAll('{{HERO_PLAY_LABEL}}', escapeHtml(homeContent.hero.playLabel))
      .replaceAll('{{HERO_EYEBROW}}', escapeHtml(homeContent.hero.eyebrow))
      .replaceAll('{{HERO_TITLE}}', escapeHtml(homeContent.hero.title))
      .replaceAll('{{HERO_SUMMARY}}', escapeHtml(homeContent.hero.summary))
      .replaceAll('{{HERO_ACTIONS_LABEL}}', escapeHtml(homeContent.hero.actionsLabel))
      .replaceAll('{{HERO_PRIMARY_LABEL}}', escapeHtml(homeContent.hero.primaryAction.label))
      .replaceAll('{{HERO_PRIMARY_URL}}', escapeHtml(homeContent.hero.primaryAction.url))
      .replaceAll('{{HERO_SECONDARY_LABEL}}', escapeHtml(homeContent.hero.secondaryAction.label))
      .replaceAll('{{HERO_SECONDARY_URL}}', escapeHtml(homeContent.hero.secondaryAction.url))
      .replaceAll('{{HERO_STUDENT_LABEL}}', escapeHtml(homeContent.hero.studentAction.label))
      .replaceAll('{{HERO_STUDENT_URL}}', escapeHtml(homeContent.hero.studentAction.url))
      .replaceAll('{{PATHWAYS_EYEBROW}}', escapeHtml(homeContent.pathways.eyebrow))
      .replaceAll('{{PATHWAYS_TITLE}}', escapeHtml(homeContent.pathways.title))
      .replaceAll('{{PATHWAYS_INTRODUCTION}}', escapeHtml(homeContent.pathways.introduction))
      .replaceAll('{{PATHWAY_ITEMS}}', pathwayItems)
      .replaceAll('{{PHOTO_REEL_LABEL}}', escapeHtml(homeContent.photoReel.label))
      .replaceAll('{{PHOTO_REEL_IMAGES}}', photoReelImages)
      .replaceAll('{{IMPACT_EYEBROW}}', escapeHtml(homeContent.impact.eyebrow))
      .replaceAll('{{IMPACT_TITLE}}', escapeHtml(homeContent.impact.title))
      .replaceAll('{{IMPACT_INTRODUCTION}}', escapeHtml(homeContent.impact.introduction))
      .replaceAll('{{IMPACT_SOURCE_LABEL}}', escapeHtml(homeContent.impact.sourceLabel))
      .replaceAll('{{IMPACT_SOURCE_URL}}', escapeHtml(homeContent.impact.sourceUrl))
      .replaceAll('{{IMPACT_ITEMS}}', impactItems)
      .replaceAll('{{MAP_EYEBROW}}', escapeHtml(homeContent.communityMap.eyebrow))
      .replaceAll('{{MAP_TITLE}}', escapeHtml(homeContent.communityMap.title))
      .replaceAll('{{MAP_INTRODUCTION}}', escapeHtml(homeContent.communityMap.introduction))
      .replaceAll('{{MAP_LABEL}}', escapeHtml(homeContent.communityMap.mapLabel))
      .replaceAll('{{MAP_FALLBACK_TEXT}}', escapeHtml(homeContent.communityMap.fallbackText))
      .replaceAll('{{MAP_LIST_LABEL}}', escapeHtml(homeContent.communityMap.listLabel))
      .replaceAll('{{MAP_PINS}}', mapPins)
      .replaceAll('{{MAP_SITE_ITEMS}}', mapSiteItems)
      .replaceAll('{{MAP_SOURCE_LABEL}}', escapeHtml(homeContent.communityMap.sourceLabel))
      .replaceAll('{{MAP_SOURCE_URL}}', escapeHtml(homeContent.communityMap.sourceUrl))
      .replaceAll('{{EVENTS_EYEBROW}}', escapeHtml(homeContent.quickEvents.eyebrow))
      .replaceAll('{{EVENTS_TITLE}}', escapeHtml(homeContent.quickEvents.title))
      .replaceAll('{{EVENTS_INTRODUCTION}}', escapeHtml(homeContent.quickEvents.introduction))
      .replaceAll('{{EVENT_ITEMS}}', eventItems)
      .replaceAll('{{EVENTS_ACTION_LABEL}}', escapeHtml(homeContent.quickEvents.actionLabel))
      .replaceAll('{{EVENTS_ACTION_URL}}', escapeHtml(homeContent.quickEvents.actionUrl))
      .replaceAll('{{MISSION_IMAGE}}', escapeHtml(assetPath(homeContent.mission.image)))
      .replaceAll('{{MISSION_IMAGE_ALT}}', escapeHtml(homeContent.mission.imageAlt))
      .replaceAll('{{MISSION_IMAGE_CAPTION}}', escapeHtml(homeContent.mission.imageCaption))
      .replaceAll('{{MISSION_EYEBROW}}', escapeHtml(homeContent.mission.eyebrow))
      .replaceAll('{{MISSION_TITLE}}', escapeHtml(homeContent.mission.title))
      .replaceAll('{{MISSION_TEXT}}', escapeHtml(homeContent.mission.text))
      .replaceAll('{{MISSION_ACTION_LABEL}}', escapeHtml(homeContent.mission.actionLabel))
      .replaceAll('{{MISSION_ACTION_URL}}', escapeHtml(homeContent.mission.actionUrl))
      .replaceAll('{{STORIES_EYEBROW}}', escapeHtml(homeContent.stories.eyebrow))
      .replaceAll('{{STORIES_TITLE}}', escapeHtml(homeContent.stories.title))
      .replaceAll('{{STORIES_ACTION_LABEL}}', escapeHtml(homeContent.stories.actionLabel))
      .replaceAll('{{STORIES_ACTION_URL}}', escapeHtml(homeContent.stories.actionUrl))
      .replaceAll('{{STORY_ITEMS}}', storyItems)
      .replaceAll('{{CONTACT_EYEBROW}}', escapeHtml(homeContent.contact.eyebrow))
      .replaceAll('{{CONTACT_TITLE}}', escapeHtml(homeContent.contact.title))
      .replaceAll('{{CONTACT_TEXT}}', escapeHtml(homeContent.contact.text))
      .replaceAll('{{CONTACT_ACTION_LABEL}}', escapeHtml(homeContent.contact.actionLabel))
      .replaceAll('{{CONTACT_ACTION_URL}}', escapeHtml(homeContent.contact.actionUrl))
      .replaceAll('{{FOOTER_DESCRIPTION}}', escapeHtml(homeContent.footer.description))
      .replaceAll('{{FOOTER_EXPLORE_HEADING}}', escapeHtml(homeContent.footer.exploreHeading))
      .replaceAll('{{FOOTER_EXPLORE_LINKS}}', renderLinks(homeContent.footer.exploreLinks))
      .replaceAll('{{FOOTER_CONNECT_HEADING}}', escapeHtml(homeContent.footer.connectHeading))
      .replaceAll('{{FOOTER_CONNECT_LINKS}}', renderLinks(homeContent.footer.connectLinks))
      .replaceAll('{{FOOTER_SOCIAL_HEADING}}', escapeHtml(homeContent.footer.socialHeading))
      .replaceAll('{{FOOTER_SOCIAL_LINKS}}', renderSocialLinks())
      .replaceAll('{{FOOTER_AFFILIATION_BLOCK}}', footerAffiliation())
      .replaceAll('{{FOOTER_DARK_MODE_LABEL}}', escapeHtml(homeContent.footer.darkModeLabel))
      .replaceAll('{{FOOTER_LIGHT_MODE_LABEL}}', escapeHtml(homeContent.footer.lightModeLabel))
      .replaceAll('{{FOOTER_COPYRIGHT}}', escapeHtml(homeContent.footer.copyright))
      .replaceAll('{{FOOTER_AFFILIATION}}', escapeHtml(homeContent.footer.affiliation))
      .replaceAll('{{CURRENT_YEAR}}', String(new Date().getFullYear()))
    : nativeFiles[page]
    ? renderNativePage(nativeFiles[page], nativeContent[nativeFiles[page]])
    : redirects[page]
    ? renderRedirect(redirects[page])
    : await readFile(join(sourceDirectory, page), 'utf8');
  if (page === 'index.html' || nativeFiles[page]) {
    const unresolved = html.match(/\{\{[A-Z0-9_]+\}\}/g);
    if (unresolved) throw new Error(`Unresolved homepage content fields: ${[...new Set(unresolved)].join(', ')}`);
  }
  // Preserve navigation within the GitHub Pages copy instead of returning to
  // the source Wix site. Links to other hosts are intentionally unchanged.
  html = html
    .replaceAll('https://www.pennkdsap.org/', `${deploymentBase}/`)
    .replaceAll('https://www.pennkdsap.org', deploymentBase);
  html = localizeWixMedia(html);
  html = setShareImage(html);
  const pagePath = page === 'index.html' ? '/' : redirects[page] ? `/${redirects[page]}/` : `/${page.slice(0, -5)}/`;
  html = setSeoUrls(html, pagePath);
  const staticLayoutScript = page === 'index.html' || nativeFiles[page] || redirects[page]
    ? ''
    : '<script src="../js/complete-static-layout.js"></script>';
  const mobileStylesheet = page === 'index.html' || nativeFiles[page] || redirects[page] ? '' : '<link rel="stylesheet" href="../css/mobile.css">';
  html = html.replace('</head>', `${mobileStylesheet}</head>`);
  html = html.replace('</body>', `${staticLayoutScript}</body>`);
  const destination = page === 'index.html'
    ? join(outputDirectory, 'index.html')
    : join(outputDirectory, page.slice(0, -5), 'index.html');
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, html);
}

await cp(join(root, 'public'), outputDirectory, { recursive: true });
await cp(join(root, 'content'), join(outputDirectory, 'content'), { recursive: true });
const sitemapUrls = pages
  .filter((page) => !redirects[page])
  .sort()
  .map((page) => page === 'index.html' ? `${publicSiteUrl}${deploymentBase}/` : `${publicSiteUrl}${deploymentBase}/${page.slice(0, -5)}/`)
  .map((url) => `  <url><loc>${url}</loc></url>`)
  .join('\n');
await writeFile(join(outputDirectory, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`);
await writeFile(join(outputDirectory, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${publicSiteUrl}${deploymentBase}/sitemap.xml\n`);
await writeFile(join(outputDirectory, '.nojekyll'), '');
console.log(`Published ${pages.length} captured pages.`);
