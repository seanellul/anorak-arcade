// Anorak Arcade glue: report active play time to the shared leaderboard tracker.
// Counts time only while a run is live (HUD visible) and the tab is focused.
(function () {
  var last = Date.now();
  setInterval(function () {
    var now = Date.now(), dt = now - last; last = now;
    if (dt < 0 || dt > 4000) return;                 // backgrounded / throttled tick — don't count
    if (document.visibilityState !== 'visible') return;
    var hud = document.getElementById('hud');
    if (hud && !hud.classList.contains('hidden') && window.GameStats) {
      window.GameStats.ping('MOTHERLOAD', dt);
    }
  }, 1000);
})();
