(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduceMotion.matches) document.documentElement.classList.add('motion-ready');

  const button = document.querySelector('.menu-button');
  const navigation = document.querySelector('.site-navigation');
  const header = document.querySelector('[data-header]');

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
    }, { threshold: .12 });
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(screeningMap);
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
      leafletMarkers.push(marker);
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
      contactForm.reset();
      status.textContent = contactForm.dataset.successMessage || '';
    } catch {
      status.textContent = contactForm.dataset.errorMessage || '';
    } finally {
      submit.disabled = false;
    }
  });
})();
