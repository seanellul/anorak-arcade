#!/usr/bin/env bash
# Sync the Motherload game from its own repo into the arcade.
#
# Single source of truth = the Motherload repo (github.com/seanellul/motherload).
# Edit the game THERE. Then run this script and commit/push the arcade — never
# edit the game inside public/motherload by hand (it gets overwritten).
#
# Usage:
#   tools/sync-motherload.sh [path-to-motherload-repo]
# Default source: ~/Code/games/pygame/motherload
set -euo pipefail

SRC="${1:-$HOME/Code/games/pygame/motherload}"
ARCADE="$(cd "$(dirname "$0")/.." && pwd)"
DST="$ARCADE/public/motherload"

[ -f "$SRC/index.html" ] || { echo "✗ Motherload source not found at: $SRC"; exit 1; }

# Optional: pull latest from the Motherload remote first — only when using the
# default local checkout (CI passes an explicit, freshly-cloned path as $1).
if [ "$#" -eq 0 ] && [ -d "$SRC/.git" ]; then
  echo "→ git pull in $SRC"
  git -C "$SRC" pull --ff-only || echo "  (skipped pull — resolve manually if needed)"
fi

echo "→ syncing web files: $SRC  →  $DST"
mkdir -p "$DST"
rm -rf "$DST/css" "$DST/js"          # only the game's web assets are replaced…
cp "$SRC/index.html" "$DST/index.html"
cp -R "$SRC/css" "$DST/css"
cp -R "$SRC/js" "$DST/js"
# …the arcade glue file (arcade-track.js) lives only here and is left untouched.

# Re-inject the arcade integration into the freshly-copied index.html.
if ! grep -q "arcade-track.js" "$DST/index.html"; then
  perl -0pi -e 's{</body>}{  <!-- Anorak Arcade integration (kept out of the game source) -->\n  <script src="../stats.js"></script>\n  <script src="arcade-track.js"></script>\n</body>}' "$DST/index.html"
  echo "→ re-injected arcade integration (stats.js + arcade-track.js)"
fi

echo "✓ synced. Next:"
echo "    git -C \"$ARCADE\" add public/motherload && git -C \"$ARCADE\" commit -m 'Sync Motherload' && git -C \"$ARCADE\" push"
