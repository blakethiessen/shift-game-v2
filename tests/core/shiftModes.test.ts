import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/gameEngine';
import {
  createDefaultPlayerInput,
  localPixelToTile,
} from '../../src/shared/types';

describe('shiftModes', () => {
  it('supports Cooperative Shift request, wall-hazard warning flags, partner confirmation, and 4000ms timeout', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('rapidSwap');
    const state = engine.getState();
    expect(state.lobbyConfig.shiftMode).toBe('cooperative');
    expect(state.evilOnLeft).toBe(false);

    // Find a tile in rapidSwap where dangerous has a wall and neutral has walkable floor
    let hazardTileX = 5;
    let hazardTileY = 5;
    for (let x = 1; x < 19; x++) {
      for (let y = 1; y < 25; y++) {
        const nCell = state.room.worlds.neutral.cells[x][y];
        const dCell = state.room.worlds.dangerous.cells[x][y];
        if (!nCell.collides && nCell.floorGid > 0 && dCell.collides) {
          hazardTileX = x;
          hazardTileY = y;
          break;
        }
      }
    }

    state.players[0].x = hazardTileX * 25;
    state.players[0].y = hazardTileY * 25;

    // P1 requests a shift -> does not shift yet, sets shiftRequest with willHitWallForP1 = true
    const p1In = createDefaultPlayerInput();
    const p2In = createDefaultPlayerInput();
    p1In.shiftRequestSeq = 1;
    engine.tick(16.67, p1In, p2In);

    expect(state.evilOnLeft).toBe(false);
    expect(state.shiftRequest.requestedBy).toBe(1);
    expect(state.shiftRequest.remainingMs).toBeGreaterThan(3900);
    expect(state.shiftRequest.willHitWallForP1).toBe(true);

    // Let request time out after 4000ms
    engine.tick(4000, p1In, p2In);
    expect(state.shiftRequest.requestedBy).toBeNull();
    expect(state.evilOnLeft).toBe(false);

    // P1 requests again, and P2 confirms within window -> executes shift!
    p1In.shiftRequestSeq = 2;
    engine.tick(16.67, p1In, p2In);
    expect(state.shiftRequest.requestedBy).toBe(1);

    p2In.shiftRequestSeq = 1;
    engine.tick(16.67, p1In, p2In);
    expect(state.evilOnLeft).toBe(true);
    expect(state.shiftRequest.requestedBy).toBeNull();
    expect(state.events.some((e) => e.type === 'dimensionShifted')).toBe(true);
  });

  it('ejects a player shifted into a wall to the nearest free tile if A* push leaves them in a wall', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('rapidSwap');
    const state = engine.getState();

    // Place P1 on a tile that is walkable in neutral but a wall in dangerous,
    // and surround P2 with walls so A* path from P1 to P2 is empty!
    let wallInDangX = 5;
    let wallInDangY = 5;
    for (let x = 2; x < 18; x++) {
      for (let y = 2; y < 24; y++) {
        const nCell = state.room.worlds.neutral.cells[x][y];
        const dCell = state.room.worlds.dangerous.cells[x][y];
        if (!nCell.collides && nCell.floorGid > 0 && dCell.collides) {
          wallInDangX = x;
          wallInDangY = y;
          break;
        }
      }
    }

    state.players[0].x = wallInDangX * 25;
    state.players[0].y = wallInDangY * 25;
    state.players[1].x = 0;
    state.players[1].y = 0; // Blocked tile so findPath returns []

    // Simultaneous shift in local mode
    const p1In = createDefaultPlayerInput();
    const p2In = createDefaultPlayerInput();
    p1In.shiftRequestSeq = 1;
    p2In.shiftRequestSeq = 1;
    engine.tick(16.67, p1In, p2In);

    expect(state.evilOnLeft).toBe(true);
    // P1 took 0.9 wall-shift damage AND was ejected out of the wall in dangerous world
    expect(state.players[0].speed).toBeCloseTo(1.8, 4);
    const p1Tile = localPixelToTile(state.players[0].x, state.players[0].y);
    expect(
      state.room.worlds.dangerous.cells[p1Tile.x][p1Tile.y].collides
    ).toBe(false);
  });

  it('supports Individual Shift mode with 1000ms anti-double-tap cooldown', () => {
    const engine = new GameEngine(42);
    engine.setLobbyConfig({ shiftMode: 'individual' });
    const state = engine.getState();
    expect(state.lobbyConfig.shiftMode).toBe('individual');
    expect(state.evilOnLeft).toBe(false);

    // P1 alone triggers immediate shift
    const p1In = createDefaultPlayerInput();
    const p2In = createDefaultPlayerInput();
    p1In.shiftRequestSeq = 1;
    engine.tick(16.67, p1In, p2In);
    expect(state.evilOnLeft).toBe(true);
    expect(state.shiftCooldownMs).toBeCloseTo(1000, 0);

    // P2 tries to shift 200ms later during cooldown -> ignored!
    p2In.shiftRequestSeq = 1;
    engine.tick(200, p1In, p2In);
    expect(state.evilOnLeft).toBe(true);

    // Wait remaining 800ms for cooldown to expire, then P2 shifts -> succeeds!
    engine.tick(800, p1In, p2In);
    expect(state.shiftCooldownMs).toBe(0);
    p2In.shiftRequestSeq = 2;
    engine.tick(16.67, p1In, p2In);
    expect(state.evilOnLeft).toBe(false);
  });
});
