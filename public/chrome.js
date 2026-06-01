/* =====================================================================
   Anorak Arcade — shared cinematic chrome (zero dependencies).
   A tiny vanilla motion layer, safe to include on any v2 page.
   Only acts on elements that are actually present, and fully
   respects prefers-reduced-motion. No libraries, no build step.

   Hooks (opt-in via markup):
     .orb[data-depth]   parallax layer (mouse + scroll)
     .reveal            fades/slides in when scrolled into view
     .stagger > .reveal children reveal in sequence
     [data-count]       counts up to its numeric text on reveal
     .magnetic          nudges toward the cursor, eases back
     .tilt              3D tilt + cursor spotlight on hover
   ===================================================================== */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---- parallax orbs (mouse drift + scroll drift) ---- */
  const orbs = $('.orb');
  if (orbs.length && !reduce) {
    let mx = 0, my = 0, sc = 0, raf = 0;
    const apply = () => {
      raf = 0;
      for (const o of orbs) {
        const d = parseFloat(o.dataset.depth) || 0.03;
        o.style.transform = `translate(${mx * d * 60}px, ${my * d * 60 + sc * d * -0.4}px)`;
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    addEventListener('mousemove', e => {
      mx = (e.clientX / innerWidth - 0.5) * 2;
      my = (e.clientY / innerHeight - 0.5) * 2;
      schedule();
    }, { passive: true });
    addEventListener('scroll', () => { sc = scrollY; schedule(); }, { passive: true });
  }

  /* ---- count-up numbers (fires once, when revealed) ---- */
  function countUp(el) {
    if (el._counted) return; el._counted = true;
    const raw = (el.dataset.count ?? el.textContent).trim();
    const target = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (!isFinite(target)) return;                 // leave ∞, %, etc. alone
    const suffix = raw.replace(/^[0-9.,\s]+/, ''); // keep trailing unit (%, +, x…)
    const dur = 900, t0 = performance.now(), dec = (target % 1 !== 0) ? 1 : 0;
    if (reduce) { el.textContent = target.toLocaleString() + suffix; return; }
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);            // easeOutCubic
      el.textContent = (target * e).toFixed(dec).replace(/\.0$/, '') + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target.toLocaleString() + suffix;
    })(t0);
  }

  /* ---- scroll reveal (+ optional stagger) ---- */
  const reveals = $('.reveal');
  if (reveals.length) {
    // pre-compute stagger delays for children of a .stagger container
    $('.stagger').forEach(group => {
      $(':scope > .reveal', group).forEach((el, i) => {
        el.style.transitionDelay = (i * 80) + 'ms';
      });
    });
    const show = el => {
      el.classList.add('in');
      $('[data-count]', el).forEach(countUp);
      if (el.matches('[data-count]')) countUp(el);
    };
    if (reduce || !('IntersectionObserver' in window)) {
      reveals.forEach(show);
    } else {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
        }
      }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(el => io.observe(el));
    }
  }
  // counters outside any .reveal (e.g. an above-the-fold hero) run right away
  $('[data-count]').forEach(el => { if (!el.closest('.reveal')) countUp(el); });

  /* ---- magnetic elements (buttons, links) ---- */
  function bindMagnetic(root) {
    $('.magnetic', root).forEach(el => {
      if (el._aaMag) return; el._aaMag = true;
      const strength = parseFloat(el.dataset.magnet) || 0.35;
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---- 3D tilt + cursor spotlight ---- */
  function bindTilt(root) {
    $('.tilt', root).forEach(card => {
      if (card._aaTilt) return; card._aaTilt = true;
      const max = parseFloat(card.dataset.tilt) || 6;
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100) + '%');
        card.style.setProperty('--my', (py * 100) + '%');
        card.style.transform =
          `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateY(-3px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  // re-bindable so pages that inject content later (e.g. the leaderboard)
  // can wire up freshly-rendered .tilt / .magnetic elements.
  function bind(root = document) { if (reduce) return; bindMagnetic(root); bindTilt(root); }
  window.AAChrome = { bind };
  bind();
})();
