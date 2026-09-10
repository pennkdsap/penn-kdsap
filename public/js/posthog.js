(() => {
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return;

  ((document, posthog) => {
    if (posthog.__SV) return;
    window.posthog = posthog;
    posthog._i = [];
    posthog.init = (projectToken, config, name) => {
      const addMethod = (target, method) => {
        const parts = method.split('.');
        if (parts.length === 2) {
          target = target[parts[0]];
          method = parts[1];
        }
        target[method] = (...args) => target.push([method, ...args]);
      };
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.src = `${config.api_host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
      document.head.appendChild(script);
      let instance = posthog;
      if (name !== undefined) instance = posthog[name] = [];
      else name = 'posthog';
      instance.people = instance.people || [];
      instance.toString = (calledAsPerson) => `${name}${calledAsPerson ? '.people' : ' (stub)'}`;
      instance.people.toString = () => instance.toString(true);
      [
        'capture', 'register', 'register_once', 'unregister', 'identify', 'set_config',
        'reset', 'opt_in_capturing', 'opt_out_capturing', 'has_opted_in_capturing',
        'has_opted_out_capturing', 'get_distinct_id', 'alias', 'setPersonProperties',
        'group', 'updateEarlyAccessFeatureEnrollment', 'getEarlyAccessFeatures',
      ].forEach((method) => addMethod(instance, method));
      posthog._i.push([projectToken, config, name]);
    };
    posthog.__SV = 1;
  })(document, window.posthog || []);

  window.posthog.init('phc_kj4EDMWEcYjWM3aAgGgs8Eso9wdtpUVBQYotRwWbR64x', {
    api_host: 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-05-30',
    autocapture: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_conversations: true,
    disable_product_tours: true,
    disable_session_recording: true,
    disable_surveys_automatic_display: true,
    disable_web_experiments: true,
    person_profiles: 'identified_only',
    persistence: 'localStorage',
  });
})();
