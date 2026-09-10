import { renderCalendar, currentDateKey } from '../public/js/calendar-view.js';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { siFacebook, siInstagram } from 'simple-icons';
import sharp from 'sharp';

const root = process.cwd();
const sourceDirectory = join(root, 'site-html-archive/pages');
const outputDirectory = join(root, 'dist');
const deploymentBase = '/penn-kdsap';
const publicSiteUrl = 'https://akashdubey.me';
const pages = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.html'));
const homeTemplate = await readFile(join(root, 'content/home-page.html'), 'utf8');
const homeContent = JSON.parse(await readFile(join(root, 'content/home.json'), 'utf8'));
const seoContent = JSON.parse(await readFile(join(root, 'content/seo.json'), 'utf8'));
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
const parseIcsDate = (value = '', sourceTimeZone = nativeContent.events.calendarTimeZone) => {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '12', minute = '00', second = '00', utc] = match;
  const allDay = !value.includes('T');
  const wallTime = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  let timestamp = wallTime;
  if (!utc && !allDay) {
    // Interpret a TZID wall-clock time, including the offset on that date.
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: sourceTimeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (let attempt = 0; attempt < 3; attempt++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
      const projected = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      const correction = wallTime - projected;
      timestamp += correction;
      if (!correction) break;
    }
  }
  const date = new Date(timestamp);
  const displayZone = nativeContent.events.calendarTimeZone || 'America/New_York';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: displayZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    date,
    dateKey: allDay ? `${year}-${month}-${day}` : `${parts.year}-${parts.month}-${parts.day}`,
    allDay,
    timeLabel: allDay ? '' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: displayZone }).format(date),
  };
};
const parseCalendarFeed = (source, calendarUrl) => {
  const unfolded = source.replace(/\r?\n[ \t]/g, '');
  return [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)].map((match) => {
    const properties = {};
    let sourceTimeZone;
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const key = line.slice(0, separator).split(';')[0];
      if (key === 'DTSTART') sourceTimeZone = line.slice(0, separator).match(/TZID=([^;:]+)/)?.[1];
      if (!(key in properties)) properties[key] = line.slice(separator + 1);
    }
    const start = parseIcsDate(properties.DTSTART, sourceTimeZone);
    if (!start || properties.STATUS === 'CANCELLED') return null;
    const title = unescapeIcsText(properties.SUMMARY || 'Public event');
    return {
      ...start,
      title,
      type: inferEventType(title, properties.CATEGORIES),
      location: unescapeIcsText(properties.LOCATION || 'Location to be announced'),
      actionLabel: 'Open public calendar',
      actionUrl: calendarUrl,
    };
  }).filter(Boolean).sort((a, b) => a.date - b.date);
};
const loadCalendarEvents = async (calendarFeedUrl, calendarUrl, audience) => {
  const upcomingEvents = [];
  if (calendarFeedUrl) {
    try {
      const response = await fetch(calendarFeedUrl, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Penn-KDSAP-site-builder/1.0' } });
      if (!response.ok) throw new Error(`Calendar feed returned ${response.status}`);
      const events = parseCalendarFeed(await response.text(), calendarUrl).map((event) => ({ ...event, audience, sample: /^\[SAMPLE\]/i.test(event.title) }));
      return { events, unavailable: false };
    } catch (error) {
      console.warn(`Calendar feed unavailable; showing the last configured examples. ${error.message}`);
    }
  }
  return { events: upcomingEvents, unavailable: true };
};
const [communityFeed, memberFeed] = await Promise.all([
  loadCalendarEvents(nativeContent.events.calendarFeedUrl, nativeContent.events.publicCalendarUrl, 'Community'),
  loadCalendarEvents(nativeContent.events.memberCalendarFeedUrl, nativeContent.events.memberCalendarUrl, 'Members'),
]);
const todayKey = currentDateKey();
const sampleEvents = (nativeContent.events.sampleEvents || []).map((event) => ({
  ...event, dateKey: event.start.slice(0, 10),
  timeLabel: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: nativeContent.events.calendarTimeZone }).format(new Date(event.start)),
  actionUrl: event.audience === 'Members' ? nativeContent.events.memberCalendarUrl : nativeContent.events.publicCalendarUrl,
}));
const eventsFor = (feed, audience) => {
  const upcoming = feed.events.filter((event) => event.dateKey >= todayKey);
  return (upcoming.length ? upcoming : sampleEvents.filter((event) => event.audience === audience && event.dateKey >= todayKey)).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.start?.localeCompare(b.start || '') || 0);
};
const publicCalendarEvents = eventsFor(communityFeed, 'Community');
const memberCalendarEvents = eventsFor(memberFeed, 'Members');
const featuredCalendarEvents = [...publicCalendarEvents, ...memberCalendarEvents].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
const calendarNotice = (events, unavailable = false) => [
  unavailable ? 'Calendar updates are temporarily unavailable. Open Google Calendar for the latest schedule.' : '',
  events.some((event) => event.sample) ? 'Example schedule only. Sample events are fictional and are not confirmed chapter dates.' : '',
].filter(Boolean).join(' ');
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
const seoPageByRoute = new Map(seoContent.pages.map((page) => [page.route, page]));
const socialImageUrl = (route) => `${publicSiteUrl}${deploymentBase}/images/social/${route || 'home'}.jpg`;
const renderLinks = (links) => links
  .map(({ label, url }) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`)
  .join('\n          ');
const renderPrefixedLinks = (links) => links
  .map(({ label, url }) => `<a href="../${escapeHtml(String(url).replace(/^\/+/, ''))}">${escapeHtml(label)}</a>`)
  .join('\n          ');
const navigation = renderLinks(homeContent.navigation);
const heroSlides = homeContent.hero.slides.slice(0, 1).map((slide, index) => {
  const desktopPosition = slide.desktopPosition || 'center center';
  const mobilePosition = slide.mobilePosition || 'center center';
  return `<picture class="hero-slide${index === 0 ? ' is-active' : ''}" data-hero-slide aria-hidden="${index === 0 ? 'false' : 'true'}" style="--hero-desktop-position:${escapeHtml(desktopPosition)};--hero-mobile-position:${escapeHtml(mobilePosition)}"><source media="(max-width: 640px)" srcset="${escapeHtml(assetPath(slide.mobileImage))}"><img src="${escapeHtml(assetPath(slide.desktopImage))}" alt="${escapeHtml(slide.imageAlt)}" width="1800" height="1200" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></picture>`;
}).join('');

const renderSocialLinks = () => homeContent.footer.socialLinks.map((link) => {
  const key = String(link.network).toLowerCase();
  const icon = socialIcons[key];
  if (!icon) throw new Error(`Unsupported footer social network: ${link.network}`);
  return `<a class="social-link social-link-${escapeHtml(key)}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(link.label)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${icon.path}"></path></svg></a>`;
}).join('');
const footerAffiliation = (prefix = '') => `<div class="footer-affiliation"><a class="footer-university" href="${escapeHtml(homeContent.footer.universityUrl)}" target="_blank" rel="noopener"><img src="${prefix}${escapeHtml(assetPath(homeContent.footer.universityLogo))}" alt="${escapeHtml(homeContent.footer.universityLogoAlt)}" width="2500" height="1500" loading="lazy"></a><p>${escapeHtml(homeContent.footer.affiliation)}</p></div>`;
const wrapSocialTitle = (value, maxCharacters = 23) => {
  const lines = [];
  let line = '';
  for (const word of String(value).split(/\s+/)) {
    if (!line || `${line} ${word}`.length <= maxCharacters) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
};
const renderSocialCard = async ({ route, title, heroImage }) => {
  const seo = seoPageByRoute.get(route);
  if (!seo) throw new Error(`Missing SEO configuration for /${route}`);
  const lines = wrapSocialTitle(title);
  const fontSize = lines.length > 3 ? 47 : lines.length > 2 ? 53 : 61;
  const lineHeight = Math.round(fontSize * 1.05);
  const titleMarkup = lines.map((line, index) => `<tspan x="72" dy="${index ? lineHeight : 0}">${escapeHtml(line)}</tspan>`).join('');
  const overlay = Buffer.from(`<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#061a34" stop-opacity=".98"/><stop offset=".52" stop-color="#071f3d" stop-opacity=".89"/><stop offset="1" stop-color="#071f3d" stop-opacity=".18"/></linearGradient><linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#071f3d" stop-opacity="0"/><stop offset="1" stop-color="#071f3d" stop-opacity=".72"/></linearGradient></defs><rect width="1200" height="630" fill="url(#shade)"/><rect width="1200" height="630" fill="url(#floor)"/><rect x="72" y="170" width="54" height="5" rx="2.5" fill="#d53452"/><text x="72" y="151" fill="#f39aaa" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700" letter-spacing="2.4">${escapeHtml(seo.label.toUpperCase())}</text><text x="72" y="236" fill="#ffffff" font-family="Georgia,Times New Roman,serif" font-size="${fontSize}" font-weight="500">${titleMarkup}</text><text x="72" y="577" fill="#dbe6f0" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="600">${escapeHtml(seoContent.socialCardFooter)}</text><text x="1128" y="578" text-anchor="end" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" letter-spacing="1.5">${escapeHtml(seoContent.socialCardAttribution.toUpperCase())}</text></svg>`);
  const logo = await sharp(join(root, 'public/images/penn-kdsap-logo.png')).resize({ width: 240 }).linear(0, 255).png().toBuffer();
  return sharp(join(root, 'public', assetPath(heroImage)))
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .modulate({ saturation: .88, brightness: .94 })
    .composite([{ input: overlay }, { input: logo, left: 72, top: 54 }])
    .jpeg({ quality: 88, progressive: true, chromaSubsampling: '4:4:4' });
};
const canonicalPageData = [
  { route: '', title: homeContent.hero.title, pageTitle: homeContent.pageTitle, heroImage: homeContent.hero.slides[0].desktopImage },
  ...Object.entries(nativeFiles).map(([file, name]) => ({
    route: file.slice(0, -5),
    title: nativeContent[name].title,
    pageTitle: nativeContent[name].pageTitle,
    heroImage: nativeContent[name].heroImage,
  })),
].sort((a, b) => a.route.localeCompare(b.route));
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
const eventItems = renderCalendar({ id: 'home-calendar', title: 'Upcoming KDSAP events', events: featuredCalendarEvents, scope: 'upcoming', notice: calendarNotice(featuredCalendarEvents, communityFeed.unavailable || memberFeed.unavailable) });
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
      <section class="interior-section screening-journey" aria-labelledby="journey-title" data-journey>
        <div class="shell journey-layout">
          <div class="journey-intro">
            <p class="eyebrow eyebrow-dark">${escapeHtml(data.journeyEyebrow)}</p>
            <h2 id="journey-title">${escapeHtml(data.journeyTitle)}</h2>
            <p>${escapeHtml(data.journeyIntroduction)}</p>
            <div class="journey-counter" aria-hidden="true"><span data-journey-current>01</span><span> / ${String(data.journeySteps.length).padStart(2, '0')}</span></div>
            <p class="journey-scroll-cue">Follow your visit <span aria-hidden="true">↓</span></p>
            <nav class="journey-nav" aria-label="Screening steps">${data.journeySteps.map((step, index) => `<a href="#screening-step-${index + 1}" aria-label="${escapeHtml(step.title)}" data-journey-link="${index}">${escapeHtml(step.number)}</a>`).join('')}</nav>
          </div>
          <ol class="screening-timeline" role="list">
            ${data.journeySteps.map((step, index) => `<li class="timeline-step" id="screening-step-${index + 1}" data-journey-step><span class="timeline-node" aria-hidden="true">${escapeHtml(step.number)}</span><article class="timeline-card"><div class="timeline-card-top"><span class="eyebrow">Station ${escapeHtml(step.number)}</span><svg viewBox="0 0 36 36" class="timeline-icon" aria-hidden="true">${journeyIcons[step.icon] || journeyIcons.clipboard}</svg></div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></article></li>`).join('')}
          </ol>
        </div>
        <div class="shell"><p class="medical-note journey-disclaimer">${escapeHtml(data.journeyDisclaimer)}</p></div>
      </section>
      <section class="interior-section section-tint" data-reveal>
        <div class="shell">
          <div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.sectionEyebrow)}</p><h2>${escapeHtml(data.sectionTitle)}</h2><p>${escapeHtml(data.sectionText)}</p></div>
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
    const calendars = [
      { id: 'community', title: 'Community events', text: 'Screenings, outreach, and kidney-health education.', url: data.publicCalendarUrl, subscribe: data.calendarSubscribeUrl, events: publicCalendarEvents, unavailable: communityFeed.unavailable },
      { id: 'members', title: data.memberTitle, text: data.memberText, url: data.memberCalendarUrl, subscribe: data.memberCalendarSubscribeUrl, events: memberCalendarEvents, unavailable: memberFeed.unavailable },
    ];
    return `<section class="interior-section calendar-section"><div class="shell"><div class="section-heading"><p class="eyebrow eyebrow-dark">${escapeHtml(data.calendarEyebrow)}</p><h2>${escapeHtml(data.calendarTitle)}</h2><p>${escapeHtml(data.calendarIntroduction)}</p></div>${calendars.map((calendar) => `<section class="calendar-block" aria-labelledby="${calendar.id}-title"><div class="calendar-block-heading"><div><h2 id="${calendar.id}-title">${escapeHtml(calendar.title)}</h2><p>${escapeHtml(calendar.text)}</p></div><div class="calendar-actions"><a class="button button-dark" href="${escapeHtml(calendar.url)}" aria-label="Open ${escapeHtml(calendar.title)} in Google Calendar">Open Google Calendar <span aria-hidden="true">↗</span></a><a class="text-link" href="${escapeHtml(calendar.subscribe)}" aria-label="Add ${escapeHtml(calendar.title)} to Google Calendar">Add to my calendar</a></div></div>${renderCalendar({ id: calendar.id, title: calendar.title, events: calendar.events, notice: calendarNotice(calendar.events, calendar.unavailable) })}</section>`).join('')}<p class="calendar-note">Schedules refresh daily. Google Calendar has the latest updates.</p></div></section>`;
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
const renderNativePage = (name, data, route) => nativeTemplate
  .replaceAll('{{PAGE_TITLE}}', escapeHtml(data.pageTitle))
  .replaceAll('{{META_DESCRIPTION}}', escapeHtml(data.metaDescription))
  .replaceAll('{{SOCIAL_IMAGE}}', escapeHtml(socialImageUrl(route)))
  .replaceAll('{{SOCIAL_IMAGE_ALT}}', escapeHtml(seoPageByRoute.get(route)?.imageAlt || data.heroImageAlt))
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
const renderRedirect = (target) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${escapeHtml(homeContent.redirectPage.pageTitle)}</title><meta http-equiv="refresh" content="0; url=../${escapeHtml(target)}/"><link rel="canonical" href="${publicSiteUrl}${deploymentBase}/${escapeHtml(target)}/"></head><body><p>${escapeHtml(homeContent.redirectPage.message)}</p><a href="../${escapeHtml(target)}/">${escapeHtml(homeContent.redirectPage.actionLabel)}</a></body></html>`;
const localizeWixMedia = (html) => html
  .replace(/https:\/\/static\.wixstatic\.com\/media\/([^\/"')?]+)(?:\/v1\/[^"')?\s<]+)?/g, (_, name) => `${deploymentBase}/images/wix/${decodeURIComponent(name)}`)
  .replace(/https:\\\/\\\/static\.wixstatic\.com\\\/media\\\/([^\\\/"')?]+)(?:\\\/v1\\\/[^\\"')?\s<]+)?/g, (_, name) => `${deploymentBase}/images/wix/${decodeURIComponent(name)}`);
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
      .replaceAll('{{SOCIAL_IMAGE}}', escapeHtml(socialImageUrl('')))
      .replaceAll('{{SOCIAL_IMAGE_ALT}}', escapeHtml(seoPageByRoute.get('')?.imageAlt || homeContent.hero.slides[0].imageAlt))
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
    ? renderNativePage(nativeFiles[page], nativeContent[nativeFiles[page]], page.slice(0, -5))
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
  const pagePath = page === 'index.html' ? '/' : redirects[page] ? `/${redirects[page]}/` : `/${page.slice(0, -5)}/`;
  html = setSeoUrls(html, pagePath);
  const staticLayoutScript = page === 'index.html' || nativeFiles[page] || redirects[page]
    ? ''
    : '<script src="../js/complete-static-layout.js"></script>';
  const mobileStylesheet = page === 'index.html' || nativeFiles[page] || redirects[page] ? '' : '<link rel="stylesheet" href="../css/mobile.css">';
  html = html.replace('</head>', `${mobileStylesheet}</head>`);
  html = html.replace('</body>', `${staticLayoutScript}</body>`);
  html = html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !/^(https?:)?\/\//i.test(href)) return tag;
    const url = new URL(href.replaceAll('&amp;', '&'), publicSiteUrl);
    if (url.origin === new URL(publicSiteUrl).origin) return tag;
    return tag.replace(/\s+target=["'][^"']*["']/gi, '').replace(/\s+rel=["'][^"']*["']/gi, '').replace(/>$/, ' target="_blank" rel="noopener noreferrer">');
  });
  const destination = page === 'index.html'
    ? join(outputDirectory, 'index.html')
    : join(outputDirectory, page.slice(0, -5), 'index.html');
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, html);
}

await cp(join(root, 'public'), outputDirectory, { recursive: true });
await cp(join(root, 'content'), join(outputDirectory, 'content'), { recursive: true });
const socialPreviewDirectory = join(outputDirectory, 'images/social');
await mkdir(socialPreviewDirectory, { recursive: true });
for (const page of canonicalPageData) {
  await renderSocialCard(page).then((image) => image.toFile(join(socialPreviewDirectory, `${page.route || 'home'}.jpg`)));
}
const sitemapUrls = canonicalPageData
  .map((page) => {
    const seo = seoPageByRoute.get(page.route);
    const pageUrl = page.route ? `${publicSiteUrl}${deploymentBase}/${page.route}/` : `${publicSiteUrl}${deploymentBase}/`;
    const heroUrl = `${publicSiteUrl}${deploymentBase}/${assetPath(page.heroImage)}`;
    return `  <url>\n    <loc>${escapeHtml(pageUrl)}</loc>\n    <lastmod>${escapeHtml(seo.lastModified)}</lastmod>\n    <image:image><image:loc>${escapeHtml(heroUrl)}</image:loc><image:title>${escapeHtml(page.pageTitle)}</image:title></image:image>\n    <image:image><image:loc>${escapeHtml(socialImageUrl(page.route))}</image:loc><image:title>${escapeHtml(`${page.pageTitle} social preview`)}</image:title></image:image>\n  </url>`;
  })
  .join('\n');
await writeFile(join(outputDirectory, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${sitemapUrls}\n</urlset>\n`);
await writeFile(join(outputDirectory, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${publicSiteUrl}${deploymentBase}/sitemap.xml\n`);
await writeFile(join(outputDirectory, '.nojekyll'), '');
console.log(`Published ${pages.length} captured pages.`);
