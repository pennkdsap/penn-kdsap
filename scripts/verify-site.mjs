import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = process.cwd();
const outputDirectory = join(root, 'dist');
const sourceDirectory = join(root, 'site-html-archive/pages');
const deploymentBase = '/penn-kdsap';
const publicSiteUrl = 'https://pennkdsap.github.io';
const pages = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.html')).sort();
const nativeFiles = new Set([
  'index.html', 'about.html', 'kidney-screenings.html', 'kdsap.html', 'calendar.html',
  'health-education.html', 'meet-the-team.html', 'partners.html', 'contact-us.html',
  'news.html', 'gallery.html',
]);
const redirects = {
  'about-1.html': 'health-education', 'about-3.html': 'news', 'alumni.html': 'meet-the-team',
  'blank-12.html': 'meet-the-team', 'chronic-kidney-disease.html': 'health-education',
  'copy-of-2024-year-in-review.html': 'news', 'copy-of-student-development.html': 'kdsap',
  'student-development.html': 'kdsap', 'the-student-council.html': 'meet-the-team',
  'what-we-do.html': 'kidney-screenings',
};
const contentTypes = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.xml': 'application/xml',
};

function relativeFile(pathname) {
  const path = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!path) return 'index.html';
  return extname(path) ? path : join(path, 'index.html');
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (request.method === 'POST' && pathname === '/test-contact') {
    response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    return;
  }
  const relative = relativeFile(pathname);
  const file = normalize(join(outputDirectory, relative));
  if (!file.startsWith(`${outputDirectory}/`) && file !== join(outputDirectory, 'index.html')) {
    response.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    response.writeHead(200, { 'content-type': contentTypes[extname(file)] ?? 'application/octet-stream' }).end(data);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const localBase = `http://127.0.0.1:${port}`;
const issues = [];

try {
  for (const file of pages) {
    const route = file === 'index.html' ? '/' : `/${file.slice(0, -5)}/`;
    const htmlFile = route === '/'
      ? join(outputDirectory, 'index.html')
      : join(outputDirectory, route, 'index.html');
    const html = await readFile(htmlFile, 'utf8');
    const canonicalRoute = redirects[file] ? `/${redirects[file]}/` : route;
    const canonical = `${publicSiteUrl}${deploymentBase}${canonicalRoute}`;
    if ((html.match(/<link rel="canonical"/g) ?? []).length !== 1 || !html.includes(`href="${canonical}"`)) {
      issues.push(`${route}: canonical URL is missing or incorrect`);
    }
    if (html.includes('href="https://www.pennkdsap.org')) {
      issues.push(`${route}: still links to the source site`);
    }
    if (redirects[file] && !html.includes('content="noindex,follow"')) {
      issues.push(`${route}: redirect page is missing noindex,follow`);
    }
    if (nativeFiles.has(file)) {
      const posthogScript = file === 'index.html' ? 'src="js/posthog.js"' : 'src="../js/posthog.js"';
      if (!html.includes(posthogScript)) issues.push(`${route}: PostHog analytics is missing`);
      const socialRoute = file === 'index.html' ? 'home' : file.slice(0, -5);
      const requiredSocialMeta = [
        'property="og:image"', 'property="og:image:type" content="image/jpeg"',
        'property="og:image:width" content="1200"', 'property="og:image:height" content="630"',
        'property="og:image:alt"', 'name="twitter:title"', 'name="twitter:description"',
        'name="twitter:image"', 'name="twitter:image:alt"',
      ];
      if (requiredSocialMeta.some((tag) => !html.includes(tag))) issues.push(`${route}: social preview metadata is incomplete`);
      try {
        const metadata = await sharp(join(outputDirectory, `images/social/${socialRoute}.jpg`)).metadata();
        if (metadata.width !== 1200 || metadata.height !== 630 || metadata.format !== 'jpeg') issues.push(`${route}: social preview image has the wrong format or dimensions`);
      } catch {
        issues.push(`${route}: social preview image is missing`);
      }
    }
  }

  const sitemap = await readFile(join(outputDirectory, 'sitemap.xml'), 'utf8');
  const canonicalCount = nativeFiles.size;
  if ((sitemap.match(/<url>/g) ?? []).length !== canonicalCount) issues.push('sitemap: canonical URL count is incorrect');
  if ((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length !== canonicalCount) issues.push('sitemap: last-modified dates are missing or invalid');
  if ((sitemap.match(/<image:image>/g) ?? []).length !== canonicalCount * 2 || !sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')) issues.push('sitemap: image metadata is incomplete');
  if (Object.keys(redirects).some((file) => sitemap.includes(`/${file.slice(0, -5)}/`))) issues.push('sitemap: redirect URLs must not be listed');
  const robots = await readFile(join(outputDirectory, 'robots.txt'), 'utf8');
  if (!robots.includes(`Sitemap: ${publicSiteUrl}${deploymentBase}/sitemap.xml`)) issues.push('robots.txt: sitemap declaration is missing');
  const posthog = await readFile(join(outputDirectory, 'js/posthog.js'), 'utf8');
  const analyticsRequirements = [
    "api_host: 'https://us.i.posthog.com'", 'autocapture: false',
    'capture_dead_clicks: false', 'capture_exceptions: false', 'capture_heatmaps: false',
    'capture_performance: false', 'disable_session_recording: true',
    'disable_surveys_automatic_display: true', 'disable_web_experiments: true',
    "person_profiles: 'identified_only'",
    "persistence: 'localStorage'", "['localhost', '127.0.0.1']",
  ];
  if (analyticsRequirements.some((requirement) => !posthog.includes(requirement))) issues.push('analytics: privacy settings or local-development exclusion are incomplete');

  const browser = await chromium.launch({ headless: true });
  const posthogRequests = [];
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.name === 'mobile' });
    page.on('request', (request) => {
      if (request.url().includes('posthog.com')) posthogRequests.push(request.url());
    });
    for (const file of pages) {
      const route = file === 'index.html' ? '/' : `/${file.slice(0, -5)}/`;
      const response = await page.goto(`${localBase}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(750);
      const result = await page.evaluate(() => ({
        externalLinkFailures: [...document.querySelectorAll('a[href]')].filter((a) => /^https?:/.test(a.href) && ![location.origin, 'https://pennkdsap.github.io'].includes(new URL(a.href).origin) && (a.target !== '_blank' || !a.relList.contains('noopener'))).map((a) => a.href),
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        height: document.body.scrollHeight,
        needsMobileMenu: Boolean(document.querySelector('#comp-j91nuigk')),
        mobileMenu: Boolean(document.querySelector('.mobile-menu-toggle')),
        nativeMenu: Boolean(document.querySelector('.menu-button')),
        h1Count: document.querySelectorAll('h1').length,
        unresolvedFields: document.documentElement.innerHTML.includes('{{'),
        brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src')),
        loginVisible: [...document.querySelectorAll('button')].some((element) => element.textContent?.includes('Log In') && element.getClientRects().length > 0),
      }));
      if (result.externalLinkFailures.length) issues.push(`${route}: external links must open safely in a new tab (${result.externalLinkFailures.join(", ")})`);
      if (response?.status() !== 200 || result.height < 1) issues.push(`${viewport.name} ${route}: page did not render`);
      if (nativeFiles.has(file) && (result.h1Count !== 1 || result.unresolvedFields || result.brokenImages.length)) {
        issues.push(`${viewport.name} ${route}: native structure or assets failed (${result.brokenImages.join(', ')})`);
      }
      if (viewport.name === 'mobile' && (result.scrollWidth > result.width || (result.needsMobileMenu && !result.mobileMenu) || result.loginVisible)) {
        issues.push(`${viewport.name} ${route}: responsive navigation or layout failed`);
      }
      if (viewport.name === 'mobile' && nativeFiles.has(file) && !result.nativeMenu) {
        issues.push(`${viewport.name} ${route}: native mobile menu is missing`);
      }
    }
    await page.close();
  }
  const interactions = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const theme of ['light', 'dark']) {
    await interactions.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await interactions.goto(localBase);
    if (await interactions.locator('[data-hero-toggle], [data-hero-dot]').count()) issues.push('home: unwanted hero controls remain');
    if (await interactions.locator('[data-hero-slide]').count() !== 1) issues.push('home: hero should use one static image');
    const contact = interactions.locator('.contact-band .button-light');
    await contact.scrollIntoViewIfNeeded();
    await contact.focus();
    await contact.hover();
    await interactions.waitForFunction(() => getComputedStyle(document.querySelector('.contact-band .button-light')).backgroundColor === 'rgb(255, 240, 226)');
    const colors = await contact.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor];
    });
    if (colors[0] !== 'rgb(124, 53, 20)' || colors[1] !== 'rgb(255, 240, 226)') issues.push(`${theme}: contact hover colors are incorrect (${colors.join(", ")})`);
    const toggle = interactions.locator('[data-theme-toggle]');
    await toggle.focus();
    await toggle.press('Enter');
    if (await interactions.locator('html').getAttribute('data-theme') !== (theme === 'dark' ? 'light' : 'dark')) issues.push('theme: keyboard toggle failed');
    await interactions.evaluate(() => localStorage.clear());
  }
  for (const width of [390, 768, 1024, 1440, 2560, 3840]) {
    await interactions.setViewportSize({ width, height: 1000 });
    await interactions.goto(localBase);
    const layout = await interactions.evaluate(() => {
      const textFits = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return text.left >= box.left - 1 && text.right <= box.right + 1;
      };
      const map = document.querySelector('.screening-map').getBoundingClientRect();
      return {
        statisticsFit: [...document.querySelectorAll('.impact-item strong')].every(textFits),
        headingFits: textFits(document.querySelector('.quick-events h2')),
        mapHasRoom: map.width >= 300 && map.height / map.width < 2,
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });
    if (Object.values(layout).some((value) => !value)) issues.push(`home at ${width}px: layout overflow (${JSON.stringify(layout)})`);
  }
  await interactions.setViewportSize({ width: 1440, height: 900 });
  await interactions.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
  await interactions.goto(`${localBase}/kidney-screenings/`);
  if (await interactions.locator('[data-journey-step]').count() !== 8) issues.push('screening: all eight stations must be present');
  for (const index of [4, 7, 0]) {
    await interactions.locator('[data-journey-link]').nth(index).click();
    await interactions.waitForFunction((number) => document.querySelector('[data-journey-current]')?.textContent === number, String(index + 1).padStart(2, '0'));
  }
  await interactions.goto(`${localBase}/calendar/`);
  if (await interactions.getByRole('link', { name: /Add .* to Google Calendar/ }).count() !== 2 || await interactions.locator('[data-custom-calendar]').count() !== 2 || await interactions.locator('iframe').count() !== 0) issues.push('calendars: two native calendars, subscription links, and no embeds are required');
  for (const widget of await interactions.locator('[data-custom-calendar]').all()) {
    const initialMonth = await widget.getAttribute('data-month');
    await widget.getByRole('button', { name: 'Next month', exact: true }).click();
    if (await widget.getAttribute('data-month') === initialMonth) issues.push('calendar: next-month navigation failed');
    await widget.getByRole('button', { name: 'Previous month', exact: true }).click();
    if (await widget.getAttribute('data-month') !== initialMonth) issues.push('calendar: previous-month navigation failed');
  }
  const calendarAnalytics = await interactions.evaluate(() => {
    window.__capturedAnalytics = [];
    window.posthog = { capture: (...args) => window.__capturedAnalytics.push(args) };
    for (const link of document.querySelectorAll('.calendar-actions [data-analytics-event]')) {
      link.addEventListener('click', (event) => event.preventDefault(), { once: true });
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    return window.__capturedAnalytics;
  });
  if (!calendarAnalytics.some(([event]) => event === 'google_calendar_opened') || !calendarAnalytics.some(([event]) => event === 'google_calendar_subscribe_clicked')) issues.push('analytics: Google Calendar conversions are not captured');
  await interactions.goto(localBase);
  if (await interactions.locator('[data-custom-calendar]').count() !== 1) issues.push('home: native calendar is missing');
  const sampleCards = interactions.locator('.custom-event').filter({ has: interactions.locator('.sample-badge') });
  if (await sampleCards.count() && !(await interactions.locator('.custom-calendar-notice').innerText()).includes('fictional')) issues.push('calendar: examples need a clear disclaimer');
  const screeningAnalytics = await interactions.evaluate(() => {
    window.__capturedAnalytics = [];
    window.posthog = { capture: (...args) => window.__capturedAnalytics.push(args) };
    const link = document.querySelector('[data-analytics-event="screening_request_clicked"]');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return window.__capturedAnalytics;
  });
  if (screeningAnalytics[0]?.[0] !== 'screening_request_clicked' || !screeningAnalytics[0]?.[1]?.location) issues.push('analytics: screening-request conversion is not captured with its location');
  await interactions.goto(`${localBase}/contact-us/`);
  await interactions.evaluate((endpoint) => {
    window.__capturedAnalytics = [];
    window.posthog = { capture: (...args) => window.__capturedAnalytics.push(args) };
    const form = document.querySelector('[data-contact-form]');
    form.dataset.endpoint = endpoint;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  }, `${localBase}/test-contact`);
  await interactions.waitForFunction(() => window.__capturedAnalytics?.some(([event]) => event === 'contact_form_submitted'));
  const contactAnalytics = await interactions.evaluate(() => window.__capturedAnalytics);
  if (contactAnalytics.some(([, properties]) => properties && Object.keys(properties).some((key) => !['form'].includes(key)))) issues.push('analytics: contact submission includes form field data');
  if (posthogRequests.length) issues.push(`analytics: local verification sent PostHog requests (${posthogRequests.join(', ')})`);
  await interactions.close();
  await browser.close();
} finally {
  server.close();
}

if (issues.length) {
  console.error(`Site verification failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${pages.length} routes at desktop and mobile viewports.`);
}
