// src/renderer/gameRenderer.ts
// Hardware-accelerated 2D Canvas renderer implementing IGameRenderer.
// Supports both Local Co-op (1000x650 dual viewport) and Online P2P Co-op (500x650
// single-dimension viewport with Final Room convergence, Partner Echo,
// Damage Vignette, synthesized ghost wall shimmer, and Online Co-op HUD overlays).

import {
  DIM_WIDTH_PX,
  DIM_HEIGHT_PX,
  DIM_WIDTH_TILES,
  DIM_HEIGHT_TILES,
  FULL_VIEWPORT_WIDTH_PX,
  FULL_VIEWPORT_HEIGHT_PX,
  TILE_SIZE_PX,
  DimensionSide,
  Direction,
  GameState,
  HealthState,
  IGameRenderer,
  PlayMode,
  PlayerId,
  PlayerState,
  RenderOptions,
  Vector2D,
  WindowScaleMode,
  WindowStageLayout,
  WorldGridState,
  WorldType,
  getBlobbyHealth,
  getDimensionTearHealth,
  getWorldForSide,
} from '../shared/types';
import {
  BANNER_SPRITES,
  SPECIAL_SPRITES,
  SpriteRect,
  getBlobbyAnimFrames,
  getDimensionTearAnim,
  getEvilLampSpriteRect,
  getFireAnimFrames,
  getGidSourceRect,
  getItemSpriteRect,
  getLampSpriteRect,
  getPlayerDeathFrames,
  getPlayerIdleSpriteRect,
  getPlayerWalkFrames,
  getWeaponSwingFrames,
  getWorldObjectSpriteRect,
} from './spriteAtlas';
import { LightingRenderer } from './lightingRenderer';

export const POPUP_BOX_WIDTH_PX = 120;
export const POPUP_DEFAULT_HEIGHT_PX = 64;
export const POPUP_VIEWPORT_MARGIN_PX = 4;

export const MIN_CAMERA_ZOOM = 1.0;
export const MAX_CAMERA_ZOOM = 4.0;
export const DEFAULT_CAMERA_ZOOM = 1.0;
export const CAMERA_ZOOM_STEP = 0.25;
export const CAMERA_ZOOM_PRESETS: readonly number[] = [
  1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0,
];

export const DEFAULT_WINDOW_SCALE_MODE: WindowScaleMode = 'fit';
export const WINDOW_SCALE_MODES: readonly WindowScaleMode[] = [
  'fit',
  'integer',
  'stretch',
  'native',
];

/**
 * Computes the display dimensions and scale factors for the game stage/canvas
 * within the browser viewport.
 *
 * - 'fit' (Default): Proportional fit to window with integer-snapped tile dimensions
 *   (every 25x25 tile is scaled to an exact integer N x N screen pixel square so the
 *   stage fills the window cleanly on 1080p/1440p/4K with zero sub-pixel tile seams).
 * - 'integer': Strict whole-canvas integer multiples (1x, 2x, 3x...) when the viewport
 *   is at least 1x, or downscales by integer tile size if the viewport is smaller than 1x.
 * - 'stretch': Fills 100% of both viewport width and height.
 * - 'native': Fixed 1x resolution (1000x650 or 500x650).
 */
export function computeWindowStageLayout(
  viewportWidth: number,
  viewportHeight: number,
  baseWidth: number = FULL_VIEWPORT_WIDTH_PX,
  baseHeight: number = FULL_VIEWPORT_HEIGHT_PX,
  mode: WindowScaleMode = DEFAULT_WINDOW_SCALE_MODE
): WindowStageLayout {
  const safeBaseW =
    Number.isFinite(baseWidth) && baseWidth > 0
      ? baseWidth
      : FULL_VIEWPORT_WIDTH_PX;
  const safeBaseH =
    Number.isFinite(baseHeight) && baseHeight > 0
      ? baseHeight
      : FULL_VIEWPORT_HEIGHT_PX;
  const safeViewW =
    Number.isFinite(viewportWidth) && viewportWidth > 0
      ? viewportWidth
      : safeBaseW;
  const safeViewH =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : safeBaseH;
  const safeMode: WindowScaleMode = WINDOW_SCALE_MODES.includes(mode)
    ? mode
    : DEFAULT_WINDOW_SCALE_MODE;

  const tilesW = Math.max(1, Math.round(safeBaseW / TILE_SIZE_PX));
  const tilesH = Math.max(1, Math.round(safeBaseH / TILE_SIZE_PX));

  if (safeMode === 'native') {
    return {
      mode: 'native',
      baseWidth: safeBaseW,
      baseHeight: safeBaseH,
      width: safeBaseW,
      height: safeBaseH,
      scaleX: 1,
      scaleY: 1,
      tilePx: TILE_SIZE_PX,
    };
  }

  if (safeMode === 'stretch') {
    const width = Math.max(1, Math.floor(safeViewW));
    const height = Math.max(1, Math.floor(safeViewH));
    return {
      mode: 'stretch',
      baseWidth: safeBaseW,
      baseHeight: safeBaseH,
      width,
      height,
      scaleX: width / safeBaseW,
      scaleY: height / safeBaseH,
      tilePx: Math.max(1, Math.floor(Math.min(width / tilesW, height / tilesH))),
    };
  }

  if (safeMode === 'integer') {
    const rawScale = Math.min(safeViewW / safeBaseW, safeViewH / safeBaseH);
    if (rawScale >= 1) {
      const intScale = Math.max(1, Math.floor(rawScale));
      return {
        mode: 'integer',
        baseWidth: safeBaseW,
        baseHeight: safeBaseH,
        width: safeBaseW * intScale,
        height: safeBaseH * intScale,
        scaleX: intScale,
        scaleY: intScale,
        tilePx: TILE_SIZE_PX * intScale,
      };
    }
    // Viewport smaller than 1x: downscale by integer tile pixel size so it never clips
    const tilePx = Math.max(
      1,
      Math.floor(Math.min(safeViewW / tilesW, safeViewH / tilesH))
    );
    const width = tilesW * tilePx;
    const height = tilesH * tilePx;
    return {
      mode: 'integer',
      baseWidth: safeBaseW,
      baseHeight: safeBaseH,
      width,
      height,
      scaleX: width / safeBaseW,
      scaleY: height / safeBaseH,
      tilePx,
    };
  }

  // 'fit' (Default): Proportional fit with integer-snapped tile dimensions
  const tilePx = Math.max(
    1,
    Math.floor(Math.min(safeViewW / tilesW, safeViewH / tilesH))
  );
  const width = tilesW * tilePx;
  const height = tilesH * tilePx;
  return {
    mode: 'fit',
    baseWidth: safeBaseW,
    baseHeight: safeBaseH,
    width,
    height,
    scaleX: width / safeBaseW,
    scaleY: height / safeBaseH,
    tilePx,
  };
}

export interface CameraViewport {
  zoom: number;
  /** Width of visible world area in room pixels (DIM_WIDTH_PX / zoom) */
  viewWidth: number;
  /** Height of visible world area in room pixels (DIM_HEIGHT_PX / zoom) */
  viewHeight: number;
  /** Top-left world X coordinate of the camera within 0..DIM_WIDTH_PX */
  camX: number;
  /** Top-left world Y coordinate of the camera within 0..DIM_HEIGHT_PX */
  camY: number;
}

/**
 * Computes the camera viewport rect in room coordinates (0..500 x 0..650)
 * centered on the player and clamped to the room edges so no out-of-bounds void is shown.
 */
export function computeCameraViewport(
  playerX: number,
  playerY: number,
  rawZoom: number = DEFAULT_CAMERA_ZOOM
): CameraViewport {
  const safeZoom =
    typeof rawZoom === 'number' && Number.isFinite(rawZoom)
      ? rawZoom
      : DEFAULT_CAMERA_ZOOM;
  const zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, safeZoom));
  const viewWidth = DIM_WIDTH_PX / zoom;
  const viewHeight = DIM_HEIGHT_PX / zoom;

  if (zoom <= 1) {
    return {
      zoom: 1,
      viewWidth: DIM_WIDTH_PX,
      viewHeight: DIM_HEIGHT_PX,
      camX: 0,
      camY: 0,
    };
  }

  const centerX = playerX + TILE_SIZE_PX / 2;
  const centerY = playerY + TILE_SIZE_PX / 2;
  const rawCamX = centerX - viewWidth / 2;
  const rawCamY = centerY - viewHeight / 2;

  const clampedCamX = Math.max(0, Math.min(DIM_WIDTH_PX - viewWidth, rawCamX));
  const clampedCamY = Math.max(0, Math.min(DIM_HEIGHT_PX - viewHeight, rawCamY));
  // Snap camera coordinates to screen-pixel increments to prevent sub-pixel tile seams at fractional zooms
  const camX = Math.round(clampedCamX * zoom) / zoom;
  const camY = Math.round(clampedCamY * zoom) / zoom;

  return {
    zoom,
    viewWidth,
    viewHeight,
    camX,
    camY,
  };
}

/**
 * Clamps the 120px-wide popup box strictly inside the local 0..500 x 0..650 viewport
 * (or the active zoomed camera viewport) so it never clips off-screen or bleeds across the center divider.
 */
export function clampPopupBoxPosition(
  anchorX: number,
  anchorY: number,
  faceDirection: Direction,
  boxWidth: number = POPUP_BOX_WIDTH_PX,
  boxHeight: number = POPUP_DEFAULT_HEIGHT_PX,
  camera?: CameraViewport
): Vector2D {
  let rawX = anchorX - (boxWidth - TILE_SIZE_PX) / 2;
  let rawY = anchorY - boxHeight - 8;

  if (faceDirection === Direction.Left) {
    rawX = anchorX - TILE_SIZE_PX - 95;
    rawY = anchorY - 20;
  } else if (faceDirection === Direction.Right) {
    rawX = anchorX + TILE_SIZE_PX;
    rawY = anchorY - 20;
  } else if (faceDirection === Direction.Up) {
    rawX = anchorX - 50;
    rawY = anchorY - TILE_SIZE_PX - 40;
  } else if (faceDirection === Direction.Down) {
    rawX = anchorX - 50;
    rawY = anchorY + TILE_SIZE_PX + 2;
  }

  const viewLeft = camera ? camera.camX : 0;
  const viewTop = camera ? camera.camY : 0;
  const viewW = camera ? camera.viewWidth : DIM_WIDTH_PX;
  const viewH = camera ? camera.viewHeight : DIM_HEIGHT_PX;

  const minX = viewLeft + POPUP_VIEWPORT_MARGIN_PX;
  const maxX = viewLeft + viewW - boxWidth - POPUP_VIEWPORT_MARGIN_PX;
  const minY = viewTop + POPUP_VIEWPORT_MARGIN_PX;
  const maxY = viewTop + viewH - boxHeight - POPUP_VIEWPORT_MARGIN_PX;

  return {
    x:
      maxX < minX
        ? viewLeft + (viewW - boxWidth) / 2
        : Math.max(minX, Math.min(maxX, rawX)),
    y:
      maxY < minY
        ? viewTop + (viewH - boxHeight) / 2
        : Math.max(minY, Math.min(maxY, rawY)),
  };
}

/**
 * Substitutes dynamic keybinding labels into book/tutorial popup strings.
 */
export function formatPopupText(
  rawText: string,
  keyStrings?: RenderOptions['keyStrings']
): string {
  if (!keyStrings) {
    return rawText;
  }
  const { p1, p2, common } = keyStrings;
  return rawText
    .replace(/\{Interact\}/g, `"${p1.Interact}" or "${p2.Interact}"`)
    .replace(/\{UseItem\}/g, `"${p1.UseItem}" or "${p2.UseItem}"`)
    .replace(/\{Inventory\}/g, `"${p1.Inventory}" or "${p2.Inventory}"`)
    .replace(/\{SwitchDimensions\}/g, `"${common.SwitchDimensions}"`)
    .replace(/[“"]Q[”"]\s+or\s+[“"],[”"]/g, `"${p1.Interact}" or "${p2.Interact}"`)
    .replace(/[“"]E[”"]\s+or\s+[“"]\.[”"]/g, `"${p1.UseItem}" or "${p2.UseItem}"`);
}

/**
 * Word-wraps popup text into lines of at most maxCharsPerLine characters.
 */
export function wrapPopupLines(
  text: string,
  maxCharsPerLine: number = 16
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * Computes floating inventory icon coordinates above the player's head
 * (y - 25, or y + 25 when player.y < 25 so it never clips off the top edge).
 */
export function computeFloatingInventoryPosition(
  playerX: number,
  playerY: number,
  camera?: CameraViewport
): Vector2D {
  const viewLeft = camera ? camera.camX : 0;
  const viewTop = camera ? camera.camY : 0;
  const viewRight = camera ? camera.camX + camera.viewWidth : DIM_WIDTH_PX;
  const clampedX = Math.max(
    viewLeft,
    Math.min(viewRight - TILE_SIZE_PX, playerX)
  );
  const y =
    playerY - viewTop < TILE_SIZE_PX
      ? playerY + TILE_SIZE_PX
      : playerY - TILE_SIZE_PX;
  return { x: clampedX, y };
}

/**
 * In Online Mode, when state.roomName === 'possibleFinalRoom' and players approach
 * the center (y > 300), returns a blend alpha in [0, 1] so both players see each
 * other converging on the FinalDoors.
 */
export function computeFinalRoomConvergenceAlpha(
  state: GameState,
  mode: PlayMode
): number {
  if (mode !== 'online' || state.roomName !== 'possibleFinalRoom') {
    return 0;
  }
  const maxY = Math.max(state.players[0].y, state.players[1].y);
  if (maxY <= 300) {
    return 0;
  }
  return Math.min(1, Math.max(0, (maxY - 300) / 250));
}

interface ActiveFlash {
  color: string;
  elapsedMs: number;
  durationMs: number;
  maxOpacity: number;
}

export class GameRenderer implements IGameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private spritesheet: CanvasImageSource | null;
  private readonly lightingRenderer: LightingRenderer;
  private elapsedTimeMs = 0;
  private lastProcessedEventId = 0;
  private activeFlash: ActiveFlash | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    spritesheetImage: CanvasImageSource | null = null,
    canvasFactory?: (w: number, h: number) => HTMLCanvasElement
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D rendering context from canvas');
    }
    this.ctx = ctx;
    this.spritesheet = spritesheetImage;
    this.lightingRenderer = new LightingRenderer(canvasFactory);
  }

  public setSpritesheet(image: CanvasImageSource): void {
    this.spritesheet = image;
  }

  public resizeForMode(mode: PlayMode): void {
    const targetWidth =
      mode === 'local' ? FULL_VIEWPORT_WIDTH_PX : DIM_WIDTH_PX;
    const targetHeight = FULL_VIEWPORT_HEIGHT_PX;
    if (this.canvas.width !== targetWidth) {
      this.canvas.width = targetWidth;
    }
    if (this.canvas.height !== targetHeight) {
      this.canvas.height = targetHeight;
    }
  }

  public triggerFlash(
    color: string,
    durationMs: number = 350,
    maxOpacity: number = 0.65
  ): void {
    this.activeFlash = {
      color,
      elapsedMs: 0,
      durationMs: Math.max(50, durationMs),
      maxOpacity: Math.max(0, Math.min(1, maxOpacity)),
    };
  }

  public render(
    state: GameState,
    options: RenderOptions,
    dtMs: number
  ): void {
    this.elapsedTimeMs += Math.max(0, dtMs);
    this.resizeForMode(options.mode);
    this.consumeFlashEvents(state);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Handle full-screen ending banners (always rendered at 1000x650 full viewport)
    if (state.phase === 'gameOver') {
      this.resizeForMode('local');
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawFullBanner(BANNER_SPRITES.I_gameOver);
      return;
    }
    if (state.phase === 'victory') {
      this.resizeForMode('local');
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawFullBanner(BANNER_SPRITES.I_theEnd);
      return;
    }

    const requestedZoom = options.cameraZoom ?? DEFAULT_CAMERA_ZOOM;
    const effectiveTestingMode = Boolean(
      options.testingMode || state.lobbyConfig?.testingMode
    );
    const effectiveLighting = options.lightingEnabled && !effectiveTestingMode;

    if (options.mode === 'local') {
      // Local Mode: 1000x650 Dual Viewport (Left @ 0..500, Right @ 500..1000)
      const leftPlayer =
        state.players[0].side === 'left' ? state.players[0] : state.players[1];
      const rightPlayer =
        state.players[1].side === 'right' ? state.players[1] : state.players[0];

      const leftCamera = computeCameraViewport(
        leftPlayer.x,
        leftPlayer.y,
        requestedZoom
      );
      const rightCamera = computeCameraViewport(
        rightPlayer.x,
        rightPlayer.y,
        requestedZoom
      );

      this.withDimensionCamera(0, leftCamera, (drawOffsetX) => {
        this.renderSingleDimensionView(
          state,
          'left',
          leftPlayer,
          rightPlayer,
          drawOffsetX,
          options,
          effectiveTestingMode
        );
        if (effectiveLighting) {
          this.lightingRenderer.renderDimensionLighting(
            ctx,
            {
              side: 'left',
              evilOnLeft: state.evilOnLeft,
              room: state.room,
              player: leftPlayer,
              timeMs: this.elapsedTimeMs,
            },
            drawOffsetX
          );
        }
        this.renderFloatingInventoryOverlay(
          state,
          leftPlayer,
          drawOffsetX,
          leftCamera
        );
      });
      // Draw popups and pings in screen space above lighting so text & indicators never clip at high zoom
      this.renderPostLightingDimensionOverlays(
        state,
        leftPlayer,
        rightPlayer,
        0,
        options,
        leftCamera
      );

      this.withDimensionCamera(DIM_WIDTH_PX, rightCamera, (drawOffsetX) => {
        this.renderSingleDimensionView(
          state,
          'right',
          rightPlayer,
          leftPlayer,
          drawOffsetX,
          options,
          effectiveTestingMode
        );
        if (effectiveLighting) {
          this.lightingRenderer.renderDimensionLighting(
            ctx,
            {
              side: 'right',
              evilOnLeft: state.evilOnLeft,
              room: state.room,
              player: rightPlayer,
              timeMs: this.elapsedTimeMs,
            },
            drawOffsetX
          );
        }
        this.renderFloatingInventoryOverlay(
          state,
          rightPlayer,
          drawOffsetX,
          rightCamera
        );
      });
      this.renderPostLightingDimensionOverlays(
        state,
        rightPlayer,
        leftPlayer,
        DIM_WIDTH_PX,
        options,
        rightCamera
      );

      // Subtle center divider line
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(DIM_WIDTH_PX, 0);
      ctx.lineTo(DIM_WIDTH_PX, FULL_VIEWPORT_HEIGHT_PX);
      ctx.stroke();
      ctx.restore();
    } else {
      // Online Mode: 500x650 Single-Dimension Viewport for localPlayerId
      const localSide: DimensionSide =
        options.localPlayerId === 1 ? 'left' : 'right';
      const partnerSide: DimensionSide =
        localSide === 'left' ? 'right' : 'left';
      const localPlayer =
        state.players[0].id === options.localPlayerId
          ? state.players[0]
          : state.players[1];
      const partnerPlayer =
        state.players[0].id === options.localPlayerId
          ? state.players[1]
          : state.players[0];

      // Special Final Room Convergence: dissolve dimensional veil and ease zoom to 1x as players approach y > 300
      const convergenceAlpha = computeFinalRoomConvergenceAlpha(
        state,
        options.mode
      );
      const effectiveZoom =
        convergenceAlpha > 0
          ? requestedZoom + (1 - requestedZoom) * convergenceAlpha
          : requestedZoom;

      const localCamera = computeCameraViewport(
        localPlayer.x,
        localPlayer.y,
        effectiveZoom
      );

      this.withDimensionCamera(0, localCamera, (drawOffsetX) => {
        this.renderSingleDimensionView(
          state,
          localSide,
          localPlayer,
          partnerPlayer,
          drawOffsetX,
          options,
          effectiveTestingMode
        );

        if (convergenceAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = convergenceAlpha * 0.85;
          this.renderDimensionWorldAndEntities(
            state,
            partnerSide,
            partnerPlayer,
            drawOffsetX,
            effectiveTestingMode
          );
          this.drawPlayerEntity(partnerPlayer, drawOffsetX, state);
          ctx.restore();
        }

        if (effectiveLighting) {
          this.lightingRenderer.renderDimensionLighting(
            ctx,
            {
              side: localSide,
              evilOnLeft: state.evilOnLeft,
              room: state.room,
              player: localPlayer,
              timeMs: this.elapsedTimeMs,
            },
            drawOffsetX
          );
          if (convergenceAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = convergenceAlpha * 0.85;
            this.drawPlayerEntity(partnerPlayer, drawOffsetX, state);
            ctx.restore();
          }
        }

        this.renderFloatingInventoryOverlay(
          state,
          localPlayer,
          drawOffsetX,
          localCamera
        );
      });

      this.renderPostLightingDimensionOverlays(
        state,
        localPlayer,
        partnerPlayer,
        0,
        options,
        localCamera
      );
    }

    // Damage pulsing red vignette around viewport edges when players are injured
    const worstHealth = this.getWorstPlayerHealthState(state, options);
    if (worstHealth !== 'Normal') {
      this.renderDamageVignette(worstHealth);
    }

    // Cooperative Shift HUD & Partner Door / Ping Overlays
    this.renderCoopHudOverlays(state, options);

    // Screen Flash FX
    this.renderFlashOverlay(dtMs);

    // Pause Overlay
    if (state.isPaused) {
      this.renderPauseOverlay();
    }
  }

  private consumeFlashEvents(state: GameState): void {
    if (state.tick <= 1 && state.events.length === 0) {
      this.lastProcessedEventId = 0;
    }
    for (const ev of state.events) {
      if (ev.eventId < this.lastProcessedEventId && state.tick <= 2) {
        this.lastProcessedEventId = 0;
      }
      if (ev.eventId > this.lastProcessedEventId) {
        this.lastProcessedEventId = ev.eventId;
        if (ev.type === 'flashScreen' && ev.color) {
          this.triggerFlash(
            ev.color,
            ev.durationMs ?? 350,
            ev.maxOpacity ?? 0.65
          );
        }
      }
    }
  }

  private withDimensionCamera(
    offsetX: number,
    camera: CameraViewport,
    fn: (drawOffsetX: number) => void
  ): void {
    if (camera.zoom <= 1) {
      fn(offsetX);
      return;
    }

    this.ctx.save();
    if ('imageSmoothingEnabled' in this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
    this.ctx.beginPath();
    this.ctx.rect(offsetX, 0, DIM_WIDTH_PX, DIM_HEIGHT_PX);
    this.ctx.clip();
    if (offsetX !== 0) {
      this.ctx.translate(offsetX, 0);
    }
    this.ctx.scale(camera.zoom, camera.zoom);
    this.ctx.translate(-camera.camX, -camera.camY);
    fn(0);
    this.ctx.restore();
  }

  private renderSingleDimensionView(
    state: GameState,
    side: DimensionSide,
    player: PlayerState,
    partner: PlayerState,
    offsetX: number,
    options: RenderOptions,
    testingMode: boolean = false
  ): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(offsetX, 0, DIM_WIDTH_PX, DIM_HEIGHT_PX);
    this.ctx.clip();

    this.renderDimensionWorldAndEntities(
      state,
      side,
      player,
      offsetX,
      testingMode
    );

    // Partner Echo in Online Mode when partnerVisibility === 'echo'
    if (options.mode === 'online' && options.partnerVisibility === 'echo') {
      this.renderPartnerEcho(partner, offsetX);
    }

    // Draw local player
    this.drawPlayerEntity(player, offsetX, state);

    this.ctx.restore();
  }

  private renderDimensionWorldAndEntities(
    state: GameState,
    side: DimensionSide,
    player: PlayerState,
    offsetX: number,
    testingMode: boolean = false
  ): void {
    const worldType: WorldType = getWorldForSide(side, state.evilOnLeft);
    const oppositeWorldType: WorldType =
      worldType === 'neutral' ? 'dangerous' : 'neutral';
    const worldGrid: WorldGridState = state.room.worlds[worldType];
    const oppositeGrid: WorldGridState = state.room.worlds[oppositeWorldType];

    // 1. Tile Grid Layers (Floor, Holes, Fake Plates, Walls, Wall Doors, Obstacles, Wall Overlays & Synthesized Ghost Walls)
    for (let tx = 0; tx < DIM_WIDTH_TILES; tx++) {
      const col = worldGrid.cells[tx];
      if (!col) continue;
      for (let ty = 0; ty < DIM_HEIGHT_TILES; ty++) {
        const cell = col[ty];
        if (!cell) continue;
        const px = offsetX + tx * TILE_SIZE_PX;
        const py = ty * TILE_SIZE_PX;

        if (cell.floorGid > 0) {
          this.drawSpriteRect(getGidSourceRect(cell.floorGid), px, py);
        }
        if (cell.holeGid > 0) {
          this.drawSpriteRect(getGidSourceRect(cell.holeGid), px, py);
        }
        if (cell.fakePlateGid > 0) {
          this.drawSpriteRect(getGidSourceRect(cell.fakePlateGid), px, py);
        }
        if (cell.wallGid > 0) {
          this.drawSpriteRect(getGidSourceRect(cell.wallGid), px, py);
        }
        if (cell.wallDoorGid > 0) {
          this.drawSpriteRect(getGidSourceRect(cell.wallDoorGid), px, py);
        }
        for (const obsGid of cell.obstacleGids) {
          if (obsGid > 0) {
            this.drawSpriteRect(getGidSourceRect(obsGid), px, py);
          }
        }
        if (cell.wallOverlayGid > 0) {
          this.drawSpriteRect(getGidSourceRect(cell.wallOverlayGid), px, py);
        } else if (cell.synthesizedGhostWall) {
          this.renderSynthesizedGhostWall(
            oppositeGrid.cells[tx]?.[ty]?.wallGid ?? 0,
            px,
            py
          );
        }
      }
    }

    // 2. Dimension Tears (rendered in both dimensions with stage & rotation)
    for (const tear of state.room.tears) {
      const anim = getDimensionTearAnim(tear.angle, tear.stage);
      const frameIdx =
        Math.floor(this.elapsedTimeMs / 90) % Math.max(1, anim.frames.length);
      const rect = anim.frames[frameIdx];
      this.drawRotatedSpriteRect(
        rect,
        offsetX + tear.x,
        tear.y,
        anim.rotationDeg
      );
    }

    // 3. Pressure Plates
    for (const plate of worldGrid.pressurePlates) {
      const rect = getWorldObjectSpriteRect(
        plate.touched ? 'pressurePlateOn' : 'pressurePlateOff',
        worldType
      );
      this.drawSpriteRect(rect, offsetX + plate.x, plate.y);
    }

    // 4. Levers
    for (const lever of worldGrid.levers) {
      const rect = getWorldObjectSpriteRect(
        lever.activated ? 'leverOn' : 'leverOff',
        worldType
      );
      this.drawSpriteRect(rect, offsetX + lever.x, lever.y);
    }

    // 5. Chests & Safes
    for (const chest of worldGrid.chests) {
      const rect = getWorldObjectSpriteRect(
        chest.opened ? 'chestOpen' : 'chestClosed',
        worldType
      );
      this.drawSpriteRect(rect, offsetX + chest.x, chest.y);
    }
    for (const safe of worldGrid.safes) {
      if (safe.gid > 0) {
        this.drawSpriteRect(
          getGidSourceRect(safe.gid),
          offsetX + safe.x,
          safe.y
        );
      } else {
        const rect = getWorldObjectSpriteRect(
          safe.opened ? 'chestOpen' : 'chestClosed',
          worldType
        );
        this.drawSpriteRect(rect, offsetX + safe.x, safe.y);
      }
    }

    // 6. Doors, GemStatues, Books, Boxes
    for (const door of worldGrid.doors) {
      if (door.gid > 0) {
        this.drawSpriteRect(
          getGidSourceRect(door.gid),
          offsetX + door.x,
          door.y
        );
      }
    }
    for (const statue of worldGrid.statues) {
      if (statue.gid > 0) {
        this.drawSpriteRect(
          getGidSourceRect(statue.gid),
          offsetX + statue.x,
          statue.y
        );
      }
    }
    for (const book of worldGrid.books) {
      if (book.gid > 0) {
        this.drawSpriteRect(
          getGidSourceRect(book.gid),
          offsetX + book.x,
          book.y
        );
      }
    }
    for (const box of worldGrid.boxes) {
      if (box.gid > 0) {
        this.drawSpriteRect(getGidSourceRect(box.gid), offsetX + box.x, box.y);
      }
    }

    // 7. Fires (active red/orange vs off/pilot blue soul-flame)
    for (const fire of worldGrid.fires) {
      const frames = getFireAnimFrames(fire.isOn);
      const idx = Math.floor(this.elapsedTimeMs / 100) % frames.length;
      this.drawSpriteRect(frames[idx], offsetX + fire.x, fire.y);
    }

    // 8. Floor Items (with S_ItemGlow when player is interacting with this item)
    for (const itemEntity of worldGrid.items) {
      if (player.interactingObjectId === itemEntity.id) {
        this.drawSpriteRect(
          SPECIAL_SPRITES.S_ItemGlow,
          offsetX + itemEntity.x,
          itemEntity.y
        );
      }
      const rect = getItemSpriteRect(
        itemEntity.item.type,
        worldType,
        itemEntity.item.lollipopColor
      );
      this.drawSpriteRect(rect, offsetX + itemEntity.x, itemEntity.y);
    }

    // 9. Lamps & EvilLamps
    for (const lamp of worldGrid.lamps) {
      const rect = getLampSpriteRect(lamp);
      this.drawSpriteRect(rect, offsetX + lamp.x, lamp.y);
    }
    for (const evilLamp of worldGrid.evilLamps) {
      const rect = getEvilLampSpriteRect(evilLamp, this.elapsedTimeMs);
      this.drawSpriteRect(rect, offsetX + evilLamp.x, evilLamp.y);
    }

    // 10. Blobbies
    for (const blobby of worldGrid.blobbies) {
      const anim = getBlobbyAnimFrames(blobby.direction);
      const idx = Math.floor(this.elapsedTimeMs / 95) % anim.frames.length;
      this.drawSpriteRect(
        anim.frames[idx],
        offsetX + blobby.x,
        blobby.y,
        anim.flipX
      );
    }

    // 11. Testing Mode Health Overlays (Blobbies & Dimension Tears)
    if (testingMode) {
      for (const tear of state.room.tears) {
        const { hp, maxHp } = getDimensionTearHealth(tear);
        const recentlyHit =
          tear.lastHitTick !== undefined && state.tick - tear.lastHitTick <= 45;
        this.renderEntityHealthBar(
          offsetX + tear.x,
          tear.y,
          hp,
          maxHp,
          recentlyHit ? '#facc15' : '#a855f7'
        );
      }

      for (const blobby of worldGrid.blobbies) {
        const { hp, maxHp } = getBlobbyHealth(blobby);
        const recentlyHit =
          blobby.lastHitTick !== undefined &&
          state.tick - blobby.lastHitTick <= 45;
        this.renderEntityHealthBar(
          offsetX + blobby.x,
          blobby.y,
          hp,
          maxHp,
          recentlyHit ? '#facc15' : '#22c55e'
        );
      }
    }
  }

  private renderEntityHealthBar(
    entityX: number,
    entityY: number,
    hp: number,
    maxHp: number,
    fillColor: string
  ): void {
    const barW = 28;
    const barH = 5;
    const barX = entityX + (TILE_SIZE_PX - barW) / 2;
    const barY = Math.max(12, entityY - 8);
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    this.ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    this.ctx.fillStyle = fillColor;
    this.ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);

    this.ctx.font = 'bold 9px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(`HP ${hp}/${maxHp}`, entityX + TILE_SIZE_PX / 2, barY - 1);
    this.ctx.restore();
  }

  private renderSynthesizedGhostWall(
    oppositeWallGid: number,
    px: number,
    py: number
  ): void {
    const shimmer = 0.2 + 0.08 * Math.sin(this.elapsedTimeMs * 0.006);
    this.ctx.save();
    this.ctx.globalAlpha = shimmer;
    if (oppositeWallGid > 0) {
      this.drawSpriteRect(getGidSourceRect(oppositeWallGid), px, py);
    }
    this.ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
    this.ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
    this.ctx.strokeStyle = 'rgba(186, 230, 253, 0.5)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE_PX - 1, TILE_SIZE_PX - 1);
    this.ctx.restore();
  }

  private drawPlayerEntity(
    player: PlayerState,
    offsetX: number,
    state: GameState
  ): void {
    const px = offsetX + player.x;
    const py = player.y;

    if (!player.isAlive || state.phase === 'dying') {
      const deathFrames = getPlayerDeathFrames(player.id, player.direction);
      const idx = Math.min(
        deathFrames.length - 1,
        Math.floor(this.elapsedTimeMs / 180) % deathFrames.length
      );
      this.drawSpriteRect(deathFrames[idx], px, py);
      return;
    }

    if (player.attackState.active && player.attackState.weapon) {
      const swing = getWeaponSwingFrames(
        player.id,
        player.attackState.weapon,
        player.attackState.direction,
        player.healthState
      );
      const totalFrames = swing.playerTile.length;
      const progress = Math.min(
        1,
        Math.max(0, 1 - player.attackState.timerMs / 250)
      );
      const frameIdx = Math.min(
        totalFrames - 1,
        Math.floor(progress * totalFrames)
      );

      this.drawSpriteRect(swing.playerTile[frameIdx], px, py);
      this.drawSpriteRect(swing.leftTile[frameIdx], px - TILE_SIZE_PX, py);
      this.drawSpriteRect(swing.rightTile[frameIdx], px + TILE_SIZE_PX, py);
      this.drawSpriteRect(swing.upTile[frameIdx], px, py - TILE_SIZE_PX);
      this.drawSpriteRect(swing.downTile[frameIdx], px, py + TILE_SIZE_PX);
      return;
    }

    if (player.isMoving) {
      const walkFrames = getPlayerWalkFrames(
        player.id,
        player.direction,
        player.healthState
      );
      const idx = Math.floor(this.elapsedTimeMs / 90) % walkFrames.length;
      this.drawSpriteRect(walkFrames[idx], px, py);
    } else {
      const idleRect = getPlayerIdleSpriteRect(
        player.id,
        player.direction,
        player.healthState
      );
      this.drawSpriteRect(idleRect, px, py);
    }
  }

  private renderPartnerEcho(partner: PlayerState, offsetX: number): void {
    const cx = offsetX + partner.x + TILE_SIZE_PX / 2;
    const cy = partner.y + TILE_SIZE_PX / 2;
    const pulse = (Math.sin(this.elapsedTimeMs * 0.008) + 1) * 0.5;

    this.ctx.save();
    this.ctx.globalAlpha = 0.28 + pulse * 0.14;
    this.ctx.strokeStyle = 'rgba(103, 232, 249, 0.85)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 10 + pulse * 5, 0, Math.PI * 2);
    this.ctx.stroke();

    const idleRect = getPlayerIdleSpriteRect(
      partner.id,
      partner.direction,
      partner.healthState
    );
    this.ctx.globalAlpha = 0.25;
    this.drawSpriteRect(idleRect, offsetX + partner.x, partner.y);
    this.ctx.restore();
  }

  private renderFloatingInventoryOverlay(
    state: GameState,
    player: PlayerState,
    offsetX: number,
    camera?: CameraViewport
  ): void {
    if (
      player.inventoryDisplayTimerMs > 0 &&
      player.inventory.length > 0 &&
      player.inventory[player.currentItemIndex]
    ) {
      const worldType = getWorldForSide(player.side, state.evilOnLeft);
      const currentItem = player.inventory[player.currentItemIndex];
      const invPos = computeFloatingInventoryPosition(
        player.x,
        player.y,
        camera
      );
      const itemRect = getItemSpriteRect(
        currentItem.type,
        worldType,
        currentItem.lollipopColor
      );
      this.drawSpriteRect(itemRect, offsetX + invPos.x, invPos.y);
    }
  }

  private renderPostLightingDimensionOverlays(
    _state: GameState,
    player: PlayerState,
    partner: PlayerState,
    offsetX: number,
    options: RenderOptions,
    camera?: CameraViewport
  ): void {
    // 1. Clamped Popup Text Box (120px wide in screen space, strictly clamped to 0..500 x 0..650)
    if (player.activePopupText) {
      const formatted = formatPopupText(
        player.activePopupText,
        options.keyStrings
      );
      const lines = wrapPopupLines(formatted, 16);
      const boxHeight = Math.max(28, lines.length * 14 + 10);
      const screenAnchorX =
        camera && camera.zoom > 1
          ? (player.x - camera.camX) * camera.zoom
          : player.x;
      const screenAnchorY =
        camera && camera.zoom > 1
          ? (player.y - camera.camY) * camera.zoom
          : player.y;
      const clamped = clampPopupBoxPosition(
        screenAnchorX,
        screenAnchorY,
        player.popupFaceDirection,
        POPUP_BOX_WIDTH_PX,
        boxHeight
      );

      this.ctx.save();
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
      this.ctx.fillRect(
        offsetX + clamped.x,
        clamped.y,
        POPUP_BOX_WIDTH_PX,
        boxHeight
      );
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(
        offsetX + clamped.x,
        clamped.y,
        POPUP_BOX_WIDTH_PX,
        boxHeight
      );
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = '10pt Courier, monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      lines.forEach((line, idx) => {
        this.ctx.fillText(
          line,
          offsetX + clamped.x + POPUP_BOX_WIDTH_PX / 2,
          clamped.y + 5 + idx * 14
        );
      });
      this.ctx.restore();
    }

    // 2. Quick Ping Ripples (projected into screen space with off-camera edge indicator)
    if (player.ping?.active) {
      this.renderPingRipple(player.ping, offsetX, '#38bdf8', camera);
    }
    if (partner.ping?.active) {
      this.renderPingRipple(partner.ping, offsetX, '#f43f5e', camera);
    }
  }

  private renderPingRipple(
    ping: NonNullable<PlayerState['ping']>,
    offsetX: number,
    color: string,
    camera?: CameraViewport
  ): void {
    const worldCx = ping.x + TILE_SIZE_PX / 2;
    const worldCy = ping.y + TILE_SIZE_PX / 2;
    const rawScreenCx =
      camera && camera.zoom > 1
        ? (worldCx - camera.camX) * camera.zoom
        : worldCx;
    const rawScreenCy =
      camera && camera.zoom > 1
        ? (worldCy - camera.camY) * camera.zoom
        : worldCy;
    const margin = 28;
    const isOffCamera =
      Boolean(camera && camera.zoom > 1) &&
      (rawScreenCx < margin ||
        rawScreenCx > DIM_WIDTH_PX - margin ||
        rawScreenCy < margin ||
        rawScreenCy > DIM_HEIGHT_PX - margin);
    const localCx =
      camera && camera.zoom > 1
        ? Math.max(margin, Math.min(DIM_WIDTH_PX - margin, rawScreenCx))
        : rawScreenCx;
    const localCy =
      camera && camera.zoom > 1
        ? Math.max(margin, Math.min(DIM_HEIGHT_PX - margin, rawScreenCy))
        : rawScreenCy;

    const cx = offsetX + localCx;
    const cy = localCy;
    const progress = 1 - Math.max(0, Math.min(1, ping.remainingMs / 2500));
    const radius = 10 + progress * 28;
    const label = ping.kind.toUpperCase();

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = Math.max(0.2, 1 - progress * 0.8);
    if (isOffCamera) {
      this.ctx.setLineDash([4, 3]);
    }
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.stroke();
    if (isOffCamera) {
      this.ctx.setLineDash([]);
    }

    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = 'bold 10px FixedSys, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(label, cx, Math.max(14, cy - radius - 2));
    this.ctx.restore();
  }

  private getWorstPlayerHealthState(
    state: GameState,
    options: RenderOptions
  ): HealthState {
    const relevantPlayers =
      options.mode === 'local'
        ? state.players
        : [state.players[options.localPlayerId - 1] ?? state.players[0]];
    if (relevantPlayers.some((p) => p.isAlive && p.healthState === 'Dying')) {
      return 'Dying';
    }
    if (relevantPlayers.some((p) => p.isAlive && p.healthState === 'Injured')) {
      return 'Injured';
    }
    if (relevantPlayers.some((p) => p.isAlive && p.healthState === 'Bruised')) {
      return 'Bruised';
    }
    return 'Normal';
  }

  private renderDamageVignette(healthState: Exclude<HealthState, 'Normal'>): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const freq =
      healthState === 'Dying'
        ? 0.018
        : healthState === 'Injured'
          ? 0.012
          : 0.008;
    const baseAlpha =
      healthState === 'Dying'
        ? 0.5
        : healthState === 'Injured'
          ? 0.28
          : 0.16;
    const pulseRange =
      healthState === 'Dying'
        ? 0.25
        : healthState === 'Injured'
          ? 0.18
          : 0.1;
    const pulse = (Math.sin(this.elapsedTimeMs * freq) + 1) * 0.5;

    this.ctx.save();
    const grd = this.ctx.createRadialGradient(
      cx,
      cy,
      maxR * 0.35,
      cx,
      cy,
      maxR
    );
    grd.addColorStop(0, 'transparent');
    grd.addColorStop(1, `rgba(220, 38, 38, ${baseAlpha + pulse * pulseRange})`);
    this.ctx.fillStyle = grd;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();
  }

  private renderCoopHudOverlays(
    state: GameState,
    options: RenderOptions
  ): void {
    const shiftKeyLabel =
      options.keyStrings?.common.SwitchDimensions ?? 'SHIFT';

    const drawShiftBannerAt = (
      centerX: number,
      viewportWidth: number,
      viewerPlayerId: PlayerId
    ) => {
      if (state.shiftRequest.requestedBy === null) return;
      const isRequestedByPartner =
        state.shiftRequest.requestedBy !== viewerPlayerId;
      const promptText = isRequestedByPartner
        ? `PARTNER REQUESTS SHIFT — PRESS [${shiftKeyLabel}] TO CONFIRM`
        : 'WAITING FOR PARTNER TO CONFIRM SHIFT...';
      const hasWallHazard =
        state.shiftRequest.willHitWallForP1 ||
        state.shiftRequest.willHitWallForP2;

      const bannerW = Math.min(viewportWidth - 20, 460);
      const bannerH = hasWallHazard ? 54 : 36;
      const bx = centerX - bannerW / 2;
      const by = 46;

      this.ctx.save();
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      this.ctx.fillRect(bx, by, bannerW, bannerH);
      this.ctx.strokeStyle = hasWallHazard ? '#ef4444' : '#38bdf8';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(bx, by, bannerW, bannerH);

      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = 'bold 11px FixedSys, monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(promptText, centerX, by + 6);

      if (hasWallHazard) {
        this.ctx.fillStyle = '#f87171';
        this.ctx.fillText(
          '⚠ DANGER: WALL COLLISION ON SHIFT!',
          centerX,
          by + 22
        );
      }

      const ratio = Math.max(
        0,
        Math.min(1, state.shiftRequest.remainingMs / 3000)
      );
      this.ctx.fillStyle = hasWallHazard ? '#ef4444' : '#38bdf8';
      this.ctx.fillRect(
        bx + 6,
        by + bannerH - 8,
        (bannerW - 12) * ratio,
        4
      );
      this.ctx.restore();
    };

    const drawDoorWaitingAt = (centerX: number) => {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      const badgeW = 240;
      const badgeH = 24;
      const bx = centerX - badgeW / 2;
      const by = this.canvas.height - 34;
      this.ctx.fillRect(bx, by, badgeW, badgeH);
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.strokeRect(bx, by, badgeW, badgeH);
      this.ctx.fillStyle = '#fde68a';
      this.ctx.font = 'bold 11px FixedSys, monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(
        'PARTNER WAITING AT DOOR',
        centerX,
        by + badgeH / 2
      );
      this.ctx.restore();
    };

    if (options.mode === 'local') {
      const leftPlayer =
        state.players[0].side === 'left' ? state.players[0] : state.players[1];
      const rightPlayer =
        state.players[1].side === 'right' ? state.players[1] : state.players[0];

      if (state.shiftRequest.requestedBy !== null) {
        drawShiftBannerAt(DIM_WIDTH_PX / 2, DIM_WIDTH_PX, leftPlayer.id);
        drawShiftBannerAt(
          DIM_WIDTH_PX + DIM_WIDTH_PX / 2,
          DIM_WIDTH_PX,
          rightPlayer.id
        );
      }
      if (rightPlayer.atDoorId !== null) {
        drawDoorWaitingAt(DIM_WIDTH_PX / 2);
      }
      if (leftPlayer.atDoorId !== null) {
        drawDoorWaitingAt(DIM_WIDTH_PX + DIM_WIDTH_PX / 2);
      }
    } else {
      const centerX = this.canvas.width / 2;
      if (state.shiftRequest.requestedBy !== null) {
        drawShiftBannerAt(centerX, this.canvas.width, options.localPlayerId);
      }
      const partnerPlayer: PlayerState =
        state.players[0].id === options.localPlayerId
          ? state.players[1]
          : state.players[0];
      if (partnerPlayer.atDoorId !== null) {
        drawDoorWaitingAt(centerX);
      }
    }
  }

  private renderFlashOverlay(dtMs: number): void {
    if (!this.activeFlash) return;
    this.activeFlash.elapsedMs += Math.max(0, dtMs);
    if (this.activeFlash.elapsedMs >= this.activeFlash.durationMs) {
      this.activeFlash = null;
      return;
    }

    const half = this.activeFlash.durationMs / 2;
    let alpha = 0;
    if (this.activeFlash.elapsedMs <= half) {
      alpha =
        (this.activeFlash.elapsedMs / half) * this.activeFlash.maxOpacity;
    } else {
      alpha =
        (1 - (this.activeFlash.elapsedMs - half) / half) *
        this.activeFlash.maxOpacity;
    }

    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    this.ctx.fillStyle = this.activeFlash.color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  private renderPauseOverlay(): void {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = 'bold 24px FixedSys, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      'PAUSED',
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    this.ctx.restore();
  }

  private drawFullBanner(rect: SpriteRect): void {
    if (!this.spritesheet) return;
    this.ctx.drawImage(
      this.spritesheet,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
  }

  private drawSpriteRect(
    rect: SpriteRect,
    destX: number,
    destY: number,
    flipX: boolean = false
  ): void {
    if (!this.spritesheet) return;
    if (!flipX) {
      this.ctx.drawImage(
        this.spritesheet,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        destX,
        destY,
        rect.w,
        rect.h
      );
      return;
    }

    this.ctx.save();
    this.ctx.translate(destX + rect.w, destY);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(
      this.spritesheet,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      0,
      0,
      rect.w,
      rect.h
    );
    this.ctx.restore();
  }

  private drawRotatedSpriteRect(
    rect: SpriteRect,
    destX: number,
    destY: number,
    rotationDeg: 0 | 90 | 180 | 270
  ): void {
    if (!this.spritesheet) return;
    if (rotationDeg === 0) {
      this.drawSpriteRect(rect, destX, destY);
      return;
    }

    const halfW = rect.w / 2;
    const halfH = rect.h / 2;
    this.ctx.save();
    this.ctx.translate(destX + halfW, destY + halfH);
    this.ctx.rotate((rotationDeg * Math.PI) / 180);
    this.ctx.drawImage(
      this.spritesheet,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      -halfW,
      -halfH,
      rect.w,
      rect.h
    );
    this.ctx.restore();
  }
}
