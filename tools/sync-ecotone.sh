#!/usr/bin/env bash
# Rebuild Ecotone and refresh public/ecotone/ in the arcade.
# Ecotone is a Vite/TS app; its source of truth is ~/Code/games/ecotone.
# Run from the arcade repo root: tools/sync-ecotone.sh [path-to-ecotone]
set -euo pipefail

ARCADE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECOTONE_DIR="${1:-$HOME/Code/games/ecotone}"
DEST="$ARCADE_ROOT/public/ecotone"

if [ ! -d "$ECOTONE_DIR" ]; then
  echo "Ecotone source not found at: $ECOTONE_DIR" >&2
  exit 1
fi

echo "Building Ecotone (relative base) from $ECOTONE_DIR ..."
( cd "$ECOTONE_DIR" && npx vite build --base=./ )

echo "Syncing build into $DEST ..."
# preserve the arcade glue, replace everything else
TMP_GLUE="$(mktemp)"
cp "$DEST/arcade-track.js" "$TMP_GLUE" 2>/dev/null || true
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$ECOTONE_DIR/dist/"* "$DEST/"
cp "$TMP_GLUE" "$DEST/arcade-track.js" 2>/dev/null || true
rm -f "$TMP_GLUE"

# re-inject the arcade glue scripts before </body>
if ! grep -q 'arcade-track.js' "$DEST/index.html"; then
  perl -0pi -e 's#(\s*</body>)#\n    <script src="../stats.js"></script>\n    <script src="arcade-track.js"></script>$1#' "$DEST/index.html"
fi

echo "Done. public/ecotone refreshed."
