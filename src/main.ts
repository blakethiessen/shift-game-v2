// src/main.ts
// Browser entry point for Shift: The Game.

import './style.css';
import { ShiftGameApp } from './app';

function bootstrap(): void {
  const stage = document.getElementById('ui-overlay');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

  if (!stage || !canvas) {
    throw new Error('Missing #ui-overlay or #game-canvas in index.html');
  }

  const app = new ShiftGameApp({
    container: stage,
    canvas,
  });

  // Preload spritesheet image and pass to renderer once loaded
  const spritesheet = new Image();
  spritesheet.src = '/images/spritesheet.png';
  spritesheet.onload = () => {
    app.setSpritesheet(spritesheet);
  };
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
