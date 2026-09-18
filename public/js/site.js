(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduceMotion.matches) document.documentElement.classList.add('motion-ready');

  const button = document.querySelector('.menu-button');
  const navigation = document.querySelector('.site-navigation');
  const header = document.querySelector('[data-header]');
  const themeButton = document.querySelector('[data-theme-toggle]');
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const captureAnalytics = (event, properties = {}) => window.posthog?.capture?.(event, properties);
  document.addEventListener('click', (clickEvent) => {
    const target = clickEvent.target instanceof Element ? clickEvent.target.closest('[data-analytics-event]') : null;
    if (!target) return;
    const properties = {};
    if (target.dataset.analyticsLocation) properties.location = target.dataset.analyticsLocation;
    if (target.dataset.analyticsCalendar) properties.calendar = target.dataset.analyticsCalendar;
    captureAnalytics(target.dataset.analyticsEvent, properties);
  });
  const applyTheme = (theme, persist = false) => {
    document.documentElement.dataset.theme = theme;
    if (persist) try { localStorage.setItem('penn-kdsap-theme', theme); } catch { /* Storage may be unavailable. */ }
    if (!themeButton) return;
    const dark = theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(dark));
    const label = themeButton.querySelector('[data-theme-label]');
    if (label) label.textContent = dark ? themeButton.dataset.lightLabel : themeButton.dataset.darkLabel;
  };
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  themeButton?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
  colorScheme.addEventListener?.('change', (event) => {
    try { if (localStorage.getItem('penn-kdsap-theme')) return; } catch { return; }
    applyTheme(event.matches ? 'dark' : 'light');
  });

  const journey = document.querySelector('[data-journey]');
  const steps = [...document.querySelectorAll('[data-journey-step]')];
  const journeyLinks = [...document.querySelectorAll('[data-journey-link]')];
  let scrollPending = false;
  const updateJourney = () => {
    if (!journey || !steps.length) return;
    const focusLine = Math.min(window.innerHeight * .45, 360);
    let active = 0;
    steps.forEach((step, index) => {
      if (step.getBoundingClientRect().top <= focusLine) active = index;
    });
    steps.forEach((step, index) => {
      step.classList.toggle('is-current', index === active);
      step.classList.toggle('is-passed', index < active);
    });
    journeyLinks.forEach((link, index) => {
      if (index === active) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    journey.querySelector('[data-journey-current]').textContent = String(active + 1).padStart(2, '0');
    const first = steps[0].getBoundingClientRect().top;
    const last = steps[steps.length - 1].getBoundingClientRect().top;
    journey.style.setProperty('--journey-progress', String(Math.max(0, Math.min(1, (focusLine - first) / Math.max(1, last - first)))));
  };
  updateJourney();
  const scheduleJourney = () => {
    if (scrollPending || !journey) return;
    scrollPending = true;
    requestAnimationFrame(() => { updateJourney(); scrollPending = false; });
  };
  window.addEventListener('scroll', scheduleJourney, { passive: true });
  window.addEventListener('resize', scheduleJourney);

  const updateScrollEffects = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 24);
    if (!reduceMotion.matches) {
      document.documentElement.style.setProperty('--hero-shift', `${Math.min(window.scrollY * .075, 64)}px`);
    }
  };
  updateScrollEffects();
  window.addEventListener('scroll', updateScrollEffects, { passive: true });

  const reveals = document.querySelectorAll('[data-reveal]');
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    // Long sections must reveal even when only a small part fits on screen.
    }, { threshold: 0 });
    reveals.forEach((element) => observer.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add('is-visible'));
  }

  if (!button || !navigation) return;

  const closeMenu = () => {
    navigation.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  };

  button.addEventListener('click', () => {
    const isOpen = navigation.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(isOpen));
  });

  navigation.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      button.focus();
    }
  });

  const mapElement = document.querySelector('[data-screening-map]');
  const mapPins = [...document.querySelectorAll('[data-map-pin]')];
  const mapSites = [...document.querySelectorAll('[data-map-site]')];
  const leafletMarkers = [];
  const selectMapSite = (index) => {
    leafletMarkers.forEach((marker, markerIndex) => {
      marker.getElement()?.querySelector('.map-marker')?.classList.toggle('is-active', markerIndex === index);
      if (markerIndex === index) marker.openTooltip();
      else marker.closeTooltip();
    });
    mapSites.forEach((site) => site.classList.toggle('is-active', site.dataset.mapSite === String(index)));
  };
  let screeningMap;
  if (mapElement && mapPins.length && window.L) {
    const points = mapPins.map((pin) => [Number(pin.dataset.latitude), Number(pin.dataset.longitude)]);
    screeningMap = window.L.map(mapElement, { scrollWheelZoom: false }).fitBounds(points, { padding: [36, 36] });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(screeningMap);
    mapElement.querySelectorAll('.leaflet-control-attribution a').forEach((link) => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
    mapElement.querySelector('[data-map-fallback]')?.remove();
    mapPins.forEach((pin, index) => {
      const tooltip = document.createElement('div');
      const name = document.createElement('strong');
      const details = document.createElement('span');
      name.textContent = pin.dataset.name || '';
      details.textContent = `${pin.dataset.address || ''} · ${pin.dataset.date || ''}`;
      tooltip.append(name, details);
      const icon = window.L.divIcon({
        className: 'map-marker-shell',
        html: `<span class="map-marker"><span>${index + 1}</span></span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 42],
      });
      const marker = window.L.marker(points[index], { icon, keyboard: true, title: pin.dataset.label || '' })
        .addTo(screeningMap)
        .bindTooltip(tooltip, { direction: 'top', offset: [0, -36] });
      leafletMarkers.push(marker);
      marker.on('mouseover focus click', () => selectMapSite(index));
      pin.remove();
    });
  }
  document.querySelectorAll('[data-map-site-button]').forEach((button) => {
    const index = Number(button.dataset.mapSiteButton);
    button.addEventListener('mouseenter', () => selectMapSite(index));
    button.addEventListener('focus', () => selectMapSite(index));
    button.addEventListener('click', () => {
      const marker = leafletMarkers[index];
      if (!marker || !screeningMap) return;
      screeningMap.panTo(marker.getLatLng());
      marker.getElement()?.focus();
    });
  });
  if (leafletMarkers.length) selectMapSite(0);

  const contactForm = document.querySelector('[data-contact-form]');
  contactForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const endpoint = contactForm.dataset.endpoint;
    const status = contactForm.querySelector('[data-form-status]');
    const submit = contactForm.querySelector('button[type="submit"]');
    if (!endpoint || !status || !submit) return;
    submit.disabled = true;
    status.textContent = '';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(contactForm))),
      });
      if (!response.ok) throw new Error('Submission failed');
      captureAnalytics('contact_form_submitted', { form: 'contact' });
      contactForm.reset();
      status.textContent = contactForm.dataset.successMessage || '';
    } catch {
      status.textContent = contactForm.dataset.errorMessage || '';
    } finally {
      submit.disabled = false;
    }
  });
})();
