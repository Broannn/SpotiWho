#!/bin/bash
# Run this AFTER setup.sh, from the project root
# It copies the React page files into the right places

echo "📄 Copying React source files..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cp "$SCRIPT_DIR/react-pages/App.jsx" client/src/App.jsx
cp "$SCRIPT_DIR/react-pages/Home.jsx" client/src/pages/Home.jsx
cp "$SCRIPT_DIR/react-pages/Rules.jsx" client/src/pages/Rules.jsx
cp "$SCRIPT_DIR/react-pages/Lobby.jsx" client/src/pages/Lobby.jsx
cp "$SCRIPT_DIR/react-pages/Game.jsx" client/src/pages/Game.jsx

echo "✅ React files copied!"
echo ""
echo "You're all set. Run: npm run dev"
