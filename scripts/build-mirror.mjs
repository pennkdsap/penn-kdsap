import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
const renderLinks = (links) => links
  .map(({ label, url }) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`)
  .join('\n          ');
const renderPrefixedLinks = (links) => links
  .map(({ label, url }) => `<a href="../${escapeHtml(String(url).replace(/^\/+/, ''))}">${escapeHtml(label)}</a>`)
  .join('\n          ');
const navigation = renderLinks(homeContent.navigation);
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
const eventItems = nativeContent.events.upcomingEvents.length
  ? nativeContent.events.upcomingEvents.slice(0, 3).map((item) => `<article class="quick-event"><time><span>${escapeHtml(item.month)}</span><strong>${escapeHtml(item.day)}</strong></time><div><p>${escapeHtml(item.type)}</p><h3>${escapeHtml(item.title)}</h3><span>${escapeHtml(item.location)}</span>${item.actionUrl ? `<a href="${escapeHtml(item.actionUrl)}">${escapeHtml(item.actionLabel)}</a>` : ''}</div></article>`).join('')
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
      <section class="interior-section" data-reveal>
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
    const agenda = data.upcomingEvents.length
      ? `<div class="events-agenda">${data.upcomingEvents.map((item) => `<article><time><span>${escapeHtml(item.month)}</span><strong>${escapeHtml(item.day)}</strong></time><div><p>${escapeHtml(item.type)}</p><h3>${escapeHtml(item.title)}</h3><span>${escapeHtml(item.location)}</span>${item.actionUrl ? `<a class="text-link" href="${escapeHtml(item.actionUrl)}">${escapeHtml(item.actionLabel)}</a>` : ''}</div></article>`).join('')}</div>`
      : `<div class="event-empty"><p class="eyebrow eyebrow-dark">${escapeHtml(data.emptyEyebrow)}</p><h2>${escapeHtml(data.emptyTitle)}</h2><p>${escapeHtml(data.emptyText)}</p>${data.publicCalendarUrl ? `<a class="button button-dark" href="${escapeHtml(data.publicCalendarUrl)}">${escapeHtml(data.calendarActionLabel)}</a>` : `<a class="button button-dark" href="${escapeHtml(data.contactActionUrl)}">${escapeHtml(data.contactActionLabel)}</a>`}</div>`;
    return `<section class="interior-section" data-reveal><div class="shell events-layout">${agenda}<aside class="privacy-panel"><h2>${escapeHtml(data.memberTitle)}</h2><p>${escapeHtml(data.memberText)}</p></aside></div></section>`;
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
      .replaceAll('{{HERO_IMAGE}}', escapeHtml(assetPath(homeContent.hero.image)))
      .replaceAll('{{HERO_IMAGE_ALT}}', escapeHtml(homeContent.hero.imageAlt))
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
