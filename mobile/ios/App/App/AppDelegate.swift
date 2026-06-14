import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// Anorak Arcade — native shell.
// Injects an app-only treatment into every page at document-start so the web arcade
// *feels* like a native game without touching the web source:
//   • marks <html class="aa-native"> so CSS can target the app only (inert on the web)
//   • forces viewport-fit=cover + safe-area padding (no content under the notch/status bar)
//   • locks the page to the viewport (no scroll / rubber-band) — the game is the focus
// Lives here (not a separate file) so it's part of the App target without a project edit.
// Referenced by Main.storyboard (customClass=AnorakViewController, module=App).
class AnorakViewController: CAPBridgeViewController {
    // capacitorDidLoad runs right after the web view is created and before the first page load.
    // (Capacitor replaces the config's userContentController in prepareWebView, so adding the
    // script in webViewConfiguration(for:) would be discarded — we add it to the live controller here.)
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let js = """
        (function () {
          var de = document.documentElement;
          de.classList.add('aa-native');

          // Critical, flash-free CSS. Safe-area padding is universal; the viewport scroll-lock
          // is scoped to .aa-game (game pages) so the scrollable arcade pages (home, leaderboard,
          // about, research) still scroll.
          var css = ''
            + 'html.aa-native body { box-sizing: border-box;'
            +   ' padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);'
            +   ' padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }'
            + 'html.aa-native.aa-game, html.aa-native.aa-game body { height: 100%; height: 100dvh;'
            +   ' max-height: 100dvh; overflow: hidden; overscroll-behavior: none; }';
          var s = document.createElement('style');
          s.id = 'aa-native-base';
          s.textContent = css;
          de.appendChild(s);

          // Once the DOM is parsed: (1) ensure viewport-fit=cover so env(safe-area-*) is non-zero,
          // (2) tag game pages (no site.css = a full-viewport game) so the scroll-lock applies.
          function finish() {
            // Force a no-zoom, safe-area-aware viewport in-app (kills double-tap-to-zoom
            // on buttons and pinch zoom — this is a game, not a document).
            var content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
            var metas = document.querySelectorAll('meta[name=viewport]');
            if (metas.length) {
              metas[metas.length - 1].setAttribute('content', content);
            } else {
              var m = document.createElement('meta'); m.name = 'viewport';
              m.setAttribute('content', content); (document.head || de).appendChild(m);
            }
            if (!document.querySelector('link[href*="site.css"]')) de.classList.add('aa-game');
            // load the app-only layer: Feel (haptics) + the native shell (tab bar, loading,
            // transitions, sheets) + its styles. All no-op / inert on the web.
            function addScript(src) {
              if (document.querySelector('script[src*="' + src + '"]')) return;
              var s = document.createElement('script'); s.src = '/' + src; (document.head || de).appendChild(s);
            }
            if (!document.querySelector('link[href*="native-app.css"]')) {
              var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/native-app.css';
              (document.head || de).appendChild(l);
            }
            addScript('feel.js');
            addScript('native-app.js');
          }
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', finish, { once: true });
          } else {
            finish();
          }
        })();
        """
        let script = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        webView?.configuration.userContentController.addUserScript(script)
    }
}
