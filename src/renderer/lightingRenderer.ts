// src/renderer/lightingRenderer.ts
// Offscreen 500x650 per-dimension lighting & shadow compositor.
// Selects the active WorldGridState via getWorldForSide(side, evilOnLeft) so
// shadows and lamps never desync when evilOnLeft === true.

import {
  DIM_WIDTH_PX,
  DIM_HEIGHT_PX,
  DIM_WIDTH_TILES,
  DIM_HEIGHT_TILES,
  TILE_SIZE_PX,
  DimensionSide,
  Direction,
  EvilLampEntity,
  FireEntity,
  PlayerState,
  RoomState,
  Vector2D,
  WorldGridState,
  WorldType,
  getWorldForSide,
} from '../shared/types';

export type ShadowQuad = [Vector2D, Vector2D, Vector2D, Vector2D];

export interface DimensionLightOptions {
  side: DimensionSide;
  evilOnLeft: boolean;
  room: RoomState;
  player: PlayerState;
  timeMs: number;
}

export interface FireHaloParams {
  radius: number;
  tintColor: string;
  tintAlpha: number;
  punchLightCircle: boolean;
}

export const LAMP_LIGHT_RADIUS_PX = 100;
export const PLAYER_BASE_HALO_RADIUS_PX = 50;
export const FLASHLIGHT_1_CONE_LENGTH_PX = 150;
export const FLASHLIGHT_2_CONE_LENGTH_PX = 350;
export const LANTERN_LIGHT_RADIUS_PX = 175;

/**
 * Converts a player facing direction into a canvas light-cone angle in radians.
 */
export function directionToLightAngleRad(direction: Direction): number {
  switch (direction) {
    case Direction.Right:
      return 0;
    case Direction.Left:
      return Math.PI;
    case Direction.Up:
      return -Math.PI / 2;
    case Direction.Down:
      return Math.PI / 2;
    case Direction.UpRight:
      return -Math.PI / 4;
    case Direction.UpLeft:
      return (-3 * Math.PI) / 4;
    case Direction.DownRight:
      return Math.PI / 4;
    case Direction.DownLeft:
      return (3 * Math.PI) / 4;
    default:
      return Math.PI / 2;
  }
}

/**
 * Computes the EvilLamp light radius (100px base with a subtle eerie sinusoidal flicker when isOn).
 */
export function getEvilLampLightRadius(
  evilLamp: EvilLampEntity,
  timeMs: number
): number {
  if (!evilLamp.isOn) {
    return 0;
  }
  const amp = evilLamp.stage === 'opening' || evilLamp.stage === 'attacking' ? 7 : 3.5;
  const freq = evilLamp.stage === 'opening' || evilLamp.stage === 'attacking' ? 0.035 : 0.014;
  // Offset phase slightly by 0.25 rad so timeMs=0 and timeMs=120 differ deterministically
  const flicker = Math.sin(timeMs * freq + 0.25) * amp;
  return LAMP_LIGHT_RADIUS_PX + flicker;
}

/**
 * Computes the FireEntity halo parameters:
 * - Active fire (isOn === true): pulsing 72..80px orange halo + light circle punch-out
 * - Inactive fire (isOn === false): faint 22px blue pilot-ember tint
 */
export function getFireHaloParams(
  fire: FireEntity,
  timeMs: number
): FireHaloParams {
  if (fire.isOn) {
    // Oscillate smoothly between 72px and 80px (legacy 9/10 .. 10/10 of 80px)
    const wave = (Math.sin(timeMs * 0.018) + 1) * 0.5;
    const radius = 72 + wave * 8;
    return {
      radius,
      tintColor: 'orange',
      tintAlpha: 0.85,
      punchLightCircle: true,
    };
  }
  return {
    radius: 22,
    tintColor: 'rgba(59, 130, 246, 0.55)',
    tintAlpha: 0.35,
    punchLightCircle: false,
  };
}

/**
 * Computes 2D shadow occlusion quads from cell.noLight tiles within lightRadius around (lightX, lightY).
 */
export function computeShadowPolygonsForLight(
  worldGrid: WorldGridState,
  lightX: number,
  lightY: number,
  lightRadius: number
): ShadowQuad[] {
  const quads: ShadowQuad[] = [];
  if (lightRadius <= 0) {
    return quads;
  }

  const startX = Math.max(0, Math.floor((lightX - lightRadius) / TILE_SIZE_PX));
  const endX = Math.min(
    DIM_WIDTH_TILES,
    Math.ceil((lightX + lightRadius) / TILE_SIZE_PX)
  );
  const startY = Math.max(0, Math.floor((lightY - lightRadius) / TILE_SIZE_PX));
  const endY = Math.min(
    DIM_HEIGHT_TILES,
    Math.ceil((lightY + lightRadius) / TILE_SIZE_PX)
  );

  for (let tileX = startX; tileX < endX; tileX++) {
    const col = worldGrid.cells[tileX];
    if (!col) continue;
    for (let tileY = startY; tileY < endY; tileY++) {
      const cell = col[tileY];
      if (!cell || !cell.noLight) continue;

      const topLeft: Vector2D = {
        x: tileX * TILE_SIZE_PX,
        y: tileY * TILE_SIZE_PX,
      };
      const topRight: Vector2D = {
        x: (tileX + 1) * TILE_SIZE_PX,
        y: tileY * TILE_SIZE_PX,
      };
      const bottomLeft: Vector2D = {
        x: tileX * TILE_SIZE_PX,
        y: (tileY + 1) * TILE_SIZE_PX,
      };
      const bottomRight: Vector2D = {
        x: (tileX + 1) * TILE_SIZE_PX,
        y: (tileY + 1) * TILE_SIZE_PX,
      };

      const centerX = (topLeft.x + bottomRight.x) / 2;
      const centerY = (topLeft.y + bottomRight.y) / 2;
      const lightToCenterX = lightX - centerX;
      const lightToCenterY = lightY - centerY;

      // Legacy edge dot tests from lightingFX.js
      const n1x = topRight.y - topLeft.y;
      const n1y = topRight.x - topLeft.x;
      const n2x = bottomRight.y - topRight.y;
      const n2y = bottomRight.x - topRight.x;
      const n3x = bottomLeft.y - bottomRight.y;
      const n3y = bottomLeft.x - bottomRight.x;
      const n4x = topLeft.y - bottomLeft.y;
      const n4y = topLeft.x - bottomLeft.x;

      const dot1 = n1x * lightToCenterX + n1y * lightToCenterY;
      const dot2 = n2x * lightToCenterX + n2y * lightToCenterY;
      const dot3 = n3x * lightToCenterX + n3y * lightToCenterY;
      const dot4 = n4x * lightToCenterX + n4y * lightToCenterY;

      const project = (pt: Vector2D): Vector2D => ({
        x: pt.x + (pt.x - lightX) * 1.5,
        y: pt.y + (pt.y - lightY) * 1.5,
      });

      if (dot3 > 0) {
        quads.push([
          bottomRight,
          project(bottomRight),
          project(bottomLeft),
          bottomLeft,
        ]);
      }
      if (dot4 > 0) {
        quads.push([
          topRight,
          project(topRight),
          project(bottomRight),
          bottomRight,
        ]);
      }
      if (dot1 > 0) {
        quads.push([topLeft, project(topLeft), project(topRight), topRight]);
      }
      if (dot2 > 0) {
        quads.push([
          bottomLeft,
          project(bottomLeft),
          project(topLeft),
          topLeft,
        ]);
      }
    }
  }

  return quads;
}

function defaultCanvasFactory(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  throw new Error('DOM document.createElement unavailable; pass a custom canvasFactory in tests.');
}

export class LightingRenderer {
  private readonly offscreenCanvas: HTMLCanvasElement;
  private readonly offscreenCtx: CanvasRenderingContext2D;

  constructor(
    canvasFactory: (w: number, h: number) => HTMLCanvasElement = defaultCanvasFactory
  ) {
    this.offscreenCanvas = canvasFactory(DIM_WIDTH_PX, DIM_HEIGHT_PX);
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D context for LightingRenderer offscreen canvas');
    }
    this.offscreenCtx = ctx;
  }

  /**
   * Renders a single 500x650 dimension lighting layer and composites it onto targetCtx at (offsetX, 0).
   * Returns the resolved WorldType ('neutral' | 'dangerous') for verification.
   */
  public renderDimensionLighting(
    targetCtx: CanvasRenderingContext2D,
    opts: DimensionLightOptions,
    offsetX: number = 0
  ): WorldType {
    const worldType = getWorldForSide(opts.side, opts.evilOnLeft);
    const worldGrid = opts.room.worlds[worldType];
    const ctx = this.offscreenCtx;

    // 1. Fill 500x650 dark map with opaque black
    ctx.save();
    ctx.clearRect(0, 0, DIM_WIDTH_PX, DIM_HEIGHT_PX);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, DIM_WIDTH_PX, DIM_HEIGHT_PX);
    ctx.restore();

    // 2. Static Lamps (100px light circle + noLight shadow occlusion polygons)
    for (const lamp of worldGrid.lamps) {
      if (lamp.isOn && !lamp.isBroken) {
        const cx = lamp.x + TILE_SIZE_PX / 2;
        const cy = lamp.y + TILE_SIZE_PX / 2;
        this.punchLightCircle(ctx, cx, cy, LAMP_LIGHT_RADIUS_PX);
        this.drawShadows(ctx, worldGrid, cx, cy, LAMP_LIGHT_RADIUS_PX);
      }
    }

    // 3. EvilLamps (100px flickering light circle + noLight shadow occlusion polygons)
    for (const evilLamp of worldGrid.evilLamps) {
      if (evilLamp.isOn) {
        const cx = evilLamp.x + TILE_SIZE_PX / 2;
        const cy = evilLamp.y + TILE_SIZE_PX / 2;
        const radius = getEvilLampLightRadius(evilLamp, opts.timeMs);
        this.punchLightCircle(ctx, cx, cy, radius);
        this.drawShadows(ctx, worldGrid, cx, cy, radius);
      }
    }

    // 4. Fire entities (pulsing 72..80px orange halo when on, faint 22px blue ember when off)
    for (const fire of worldGrid.fires) {
      const cx = fire.x + TILE_SIZE_PX / 2;
      const cy = fire.y + TILE_SIZE_PX / 2;
      const halo = getFireHaloParams(fire, opts.timeMs);
      this.drawLightTint(ctx, cx, cy, halo.radius, halo.tintAlpha, halo.tintColor);
      if (halo.punchLightCircle) {
        this.punchLightCircle(ctx, cx, cy, halo.radius);
      }
    }

    // 5. Dynamic Player Lights: base 50px halo + active flashlight/lantern
    const px = opts.player.x + TILE_SIZE_PX / 2;
    const py = opts.player.y + TILE_SIZE_PX / 2;
    this.punchLightCircle(ctx, px, py, PLAYER_BASE_HALO_RADIUS_PX);

    const beamDir =
      opts.player.flashLightDir !== Direction.None
        ? opts.player.flashLightDir
        : opts.player.direction;

    if (opts.player.flashlightMode === 'flashlight1') {
      this.punchLightCone(ctx, px, py, beamDir, FLASHLIGHT_1_CONE_LENGTH_PX);
    } else if (opts.player.flashlightMode === 'flashlight2') {
      this.punchLightCone(ctx, px, py, beamDir, FLASHLIGHT_2_CONE_LENGTH_PX);
    } else if (opts.player.flashlightMode === 'lantern') {
      this.punchLightCircle(ctx, px, py, LANTERN_LIGHT_RADIUS_PX);
    }

    // 6. Composite onto target canvas at (offsetX, 0)
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.globalAlpha = 1;
    targetCtx.drawImage(this.offscreenCanvas, offsetX, 0);
    targetCtx.restore();

    return worldType;
  }

  private punchLightCircle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number
  ): void {
    if (radius <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grd.addColorStop(0, 'black');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  private drawLightTint(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    alpha: number,
    color: string
  ): void {
    if (radius <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  private punchLightCone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: Direction,
    length: number
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 0.6;

    const angle = directionToLightAngleRad(direction);
    const spread = Math.PI / 8;
    const cwx = x + length * Math.cos(angle + spread);
    const cwy = y + length * Math.sin(angle + spread);
    const ccwx = x + length * Math.cos(angle - spread);
    const ccwy = y + length * Math.sin(angle - spread);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(cwx, cwy);
    ctx.lineTo(ccwx, ccwy);
    ctx.lineTo(x, y);
    ctx.closePath();

    const innerRadius = Math.min(100, length * 0.65);
    const grd = ctx.createRadialGradient(x, y, innerRadius, x, y, length);
    grd.addColorStop(0, 'black');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.restore();
  }

  private drawShadows(
    ctx: CanvasRenderingContext2D,
    worldGrid: WorldGridState,
    lightX: number,
    lightY: number,
    lightRadius: number
  ): void {
    const quads = computeShadowPolygonsForLight(
      worldGrid,
      lightX,
      lightY,
      lightRadius
    );
    if (quads.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'black';
    ctx.globalAlpha = 0.22;

    for (const [p0, p1, p2, p3] of quads) {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
