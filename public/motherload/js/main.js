// ============================================================
//  Motherload — entry point
// ============================================================
import { Game } from "./game.js?v=47";

const canvas = document.getElementById("game");
const game = new Game(canvas);

// Expose for debugging / automated testing
window.__game = game;
