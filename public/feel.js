/* =====================================================================
   Anorak Arcade — the Feel layer.
   A tiny, consistent haptic vocabulary (Tactile pillar, feature #1).
   No-op on the web; routes to the native Taptic engine in the app via
   Capacitor's Haptics plugin. Every meaningful interaction should speak
   through ONE of these verbs so touch becomes a consistent language.
   User-controlled (aa.haptics) and silenced by Reduce Motion.
   ===================================================================== */
(function () {
  var Cap = window.Capacitor;
  var H = Cap && Cap.Plugins && Cap.Plugins.Haptics;   // present only in the native app
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function on() { try { return localStorage.getItem('aa.haptics') !== '0'; } catch (e) { return true; } }
  function live() { return !!H && on() && !reduce; }

  function impact(style) { if (!live()) return; try { H.impact({ style: style }); } catch (e) {} }
  function notify(type) { if (!live()) return; try { H.notification({ type: type }); } catch (e) {} }

  window.Feel = {
    // is tactile feedback actually available + enabled right now?
    available: function () { return !!H; },
    enabled: function () { return !!H && on(); },
    setEnabled: function (v) { try { localStorage.setItem('aa.haptics', v ? '1' : '0'); } catch (e) {} },

    // --- the vocabulary (keep it small + consistent) ---
    select: function () {                 // focus/move: tab, card, menu open
      if (!live()) return;
      try { H.selectionStart(); H.selectionEnd(); } catch (e) { impact('LIGHT'); }
    },
    tap:     function () { impact('LIGHT'); },   // a light, browse-y press
    commit:  function () { impact('MEDIUM'); },  // an act with consequence: place a wall, drop a mote
    heavy:   function () { impact('HEAVY'); },   // a big beat: a chain detonation, a supernova
    success: function () { notify('SUCCESS'); }, // new best, sealed pocket, level cleared
    warn:    function () { notify('WARNING'); }, // danger: a needle in the red, fire about to overrun
    fail:    function () { notify('ERROR'); }    // run over
  };
})();
