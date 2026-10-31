import { describe, expect, it } from 'vitest';
import {
  DIM_HEIGHT_PX,
  DIM_HEIGHT_TILES,
  DIM_WIDTH_PX,
  DIM_WIDTH_TILES,
  Direction,
  FULL_VIEWPORT_WIDTH_PX,
  SeededRandom,
  TILE_SIZE_PX,
  createDefaultLobbyConfig,
  createDefaultPlayerInput,
  getSideForWorld,
  getWorldForSide,
  localPixelToTile,
  tileManhattanDistance,
  tileToLocalPixel,
} from '../../src/shared/types';

describe('shared/types constants & helpers', () => {
  it('defines exact dimension and viewport constants matching Shift 2012', () => {
    expect(TILE_SIZE_PX).toBe(25);
    expect(DIM_WIDTH_TILES).toBe(20);
    expect(DIM_HEIGHT_TILES).toBe(26);
    expect(DIM_WIDTH_PX).toBe(500);
    expect(DIM_HEIGHT_PX).toBe(650);
    expect(FULL_VIEWPORT_WIDTH_PX).toBe(1000);
  });

  it('maps DimensionSide <-> WorldType accurately based on evilOnLeft', () => {
    expect(getWorldForSide('left', false)).toBe('neutral');
    expect(getWorldForSide('right', false)).toBe('dangerous');
    expect(getWorldForSide('left', true)).toBe('dangerous');
    expect(getWorldForSide('right', true)).toBe('neutral');

    expect(getSideForWorld('neutral', false)).toBe('left');
    expect(getSideForWorld('dangerous', false)).toBe('right');
    expect(getSideForWorld('neutral', true)).toBe('right');
    expect(getSideForWorld('dangerous', true)).toBe('left');
  });

  it('converts between local pixels and clamped tile coordinates', () => {
    expect(localPixelToTile(0, 0)).toEqual({ x: 0, y: 0 });
    expect(localPixelToTile(25, 50)).toEqual({ x: 1, y: 2 });
    // Center of tile (12, 12) should still map to (0, 0)
    expect(localPixelToTile(10, 10)).toEqual({ x: 0, y: 0 });
    // Clamping at boundaries
    expect(localPixelToTile(-10, -5)).toEqual({ x: 0, y: 0 });
    expect(localPixelToTile(500, 650)).toEqual({ x: 19, y: 25 });

    expect(tileToLocalPixel({ x: 3, y: 7 })).toEqual({ x: 75, y: 175 });
  });

  it('computes Manhattan distance between two tile coordinates', () => {
    expect(tileManhattanDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    expect(tileManhattanDistance({ x: 2, y: 3 }, { x: 5, y: 7 })).toBe(7);
  });

  it('produces deterministic random sequences from SeededRandom', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);

    const seq1 = [rng1.nextFloat(), rng1.nextInt(0, 10), rng1.nextFloat()];
    const seq2 = [rng2.nextFloat(), rng2.nextInt(0, 10), rng2.nextFloat()];

    expect(seq1).toEqual(seq2);
    expect(rng1.getState()).toBe(rng2.getState());
  });

  it('creates default PlayerInput and LobbyConfig with cooperative shift as default', () => {
    const input = createDefaultPlayerInput();
    expect(input.up).toBe(false);
    expect(input.useItemSeq).toBe(0);

    const lobby = createDefaultLobbyConfig();
    expect(lobby.shiftMode).toBe('cooperative');
    expect(lobby.partnerVisibility).toBe('strict');
    expect(lobby.muffledCrossDimensionAudio).toBe(true);
  });
});
