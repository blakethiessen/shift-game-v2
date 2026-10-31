import { describe, it, expect } from 'vitest';
import {
  Direction,
  HealthState,
  ItemType,
  WeaponType,
  LampEntity,
  EvilLampEntity,
} from '../../src/shared/types';
import {
  SPRITESHEET_WIDTH,
  SPRITESHEET_HEIGHT,
  SPRITESHEET_COLS,
  SPECIAL_SPRITES,
  BANNER_SPRITES,
  getGidSourceRect,
  getTileSourceRect,
  getWorldObjectSpriteRect,
  getLampSpriteRect,
  getItemSpriteRect,
  getPlayerWalkFrames,
  getPlayerIdleSpriteRect,
  getPlayerDeathFrames,
  getWeaponSwingFrames,
  getBlobbyAnimFrames,
  getEvilLampFrames,
  getEvilLampSpriteRect,
  getFireAnimFrames,
  getDimensionTearAnim,
} from '../../src/renderer/spriteAtlas';

describe('spriteAtlas', () => {
  describe('spritesheet dimensions and GID mapping', () => {
    it('defines exact 1949x1525 dimensions and 77 columns of 25x25 tiles', () => {
      expect(SPRITESHEET_WIDTH).toBe(1949);
      expect(SPRITESHEET_HEIGHT).toBe(1525);
      expect(SPRITESHEET_COLS).toBe(77);
    });

    it('calculates getGidSourceRect(gid) using 1-based GID on a 77-column grid', () => {
      // gid = 1 -> col 0, row 0 -> (0, 0, 25, 25)
      expect(getGidSourceRect(1)).toEqual({ x: 0, y: 0, w: 25, h: 25 });
      // gid = 77 -> col 76, row 0 -> (1900, 0, 25, 25)
      expect(getGidSourceRect(77)).toEqual({ x: 76 * 25, y: 0, w: 25, h: 25 });
      // gid = 78 -> col 0, row 1 -> (0, 25, 25, 25)
      expect(getGidSourceRect(78)).toEqual({ x: 0, y: 25, w: 25, h: 25 });
      // gid = 3402 (EvilLamp head in levels.js): (3401 % 77) = 13, floor(3401 / 77) = 44
      expect(getGidSourceRect(3402)).toEqual({
        x: ((3402 - 1) % 77) * 25,
        y: Math.floor((3402 - 1) / 77) * 25,
        w: 25,
        h: 25,
      });
      expect(getTileSourceRect(3402)).toEqual(getGidSourceRect(3402));
    });
  });

  describe('world objects and items (neutral N_* vs dangerous D_* +7 col offset)', () => {
    it('maps pressure plates, levers, chests, and tall/short lamps for both worlds', () => {
      expect(getWorldObjectSpriteRect('pressurePlateOff', 'neutral')).toEqual({
        x: 0 * 25,
        y: 1 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('pressurePlateOn', 'neutral')).toEqual({
        x: 1 * 25,
        y: 1 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('pressurePlateOff', 'dangerous')).toEqual({
        x: 7 * 25,
        y: 1 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('pressurePlateOn', 'dangerous')).toEqual({
        x: 8 * 25,
        y: 1 * 25,
        w: 25,
        h: 25,
      });

      expect(getWorldObjectSpriteRect('leverOff', 'neutral')).toEqual({
        x: 0 * 25,
        y: 2 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('leverOn', 'dangerous')).toEqual({
        x: 8 * 25,
        y: 2 * 25,
        w: 25,
        h: 25,
      });

      expect(getWorldObjectSpriteRect('chestClosed', 'neutral')).toEqual({
        x: 0 * 25,
        y: 3 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('chestOpen', 'dangerous')).toEqual({
        x: 8 * 25,
        y: 3 * 25,
        w: 25,
        h: 25,
      });

      expect(getWorldObjectSpriteRect('tallLampOn', 'neutral')).toEqual({
        x: 0 * 25,
        y: 4 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('tallLampOff', 'neutral')).toEqual({
        x: 1 * 25,
        y: 4 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('shortLampOn', 'dangerous')).toEqual({
        x: 7 * 25,
        y: 6 * 25,
        w: 25,
        h: 25,
      });
      expect(getWorldObjectSpriteRect('shortLampOff', 'dangerous')).toEqual({
        x: 8 * 25,
        y: 6 * 25,
        w: 25,
        h: 25,
      });
    });

    it('resolves LampEntity on/off sprite rect correctly', () => {
      const tallLamp: LampEntity = {
        id: 'lamp-1',
        world: 'neutral',
        x: 100,
        y: 100,
        gid: 4 * 77 + 1, // row 4, col 0
        isOn: false,
        isBroken: false,
        linkedLampId: null,
        popUpText: '',
      };
      expect(getLampSpriteRect(tallLamp)).toEqual({
        x: 1 * 25,
        y: 4 * 25,
        w: 25,
        h: 25,
      });
      expect(getLampSpriteRect({ ...tallLamp, isOn: true })).toEqual({
        x: 0 * 25,
        y: 4 * 25,
        w: 25,
        h: 25,
      });
    });

    it('maps all 15 item types and lollipop variants with +7 dangerous col offset', () => {
      const expectedNeutralCoords: Record<ItemType, [number, number]> = {
        Flashlight: [1, 44],
        Flashlight2: [2, 44],
        Lantern: [3, 44],
        BlackKey: [1, 45],
        Key: [2, 45],
        GreenGem: [1, 46],
        BlueGem: [2, 46],
        RedGem: [3, 46],
        Chips: [1, 47],
        Plunger: [3, 47],
        Broom: [4, 47],
        WaterBottle: [1, 48],
        Sandwich: [2, 48],
        FryingPan: [3, 48],
        Lollipop: [1, 49],
      };

      for (const [type, [col, row]] of Object.entries(expectedNeutralCoords) as Array<
        [ItemType, [number, number]]
      >) {
        expect(getItemSpriteRect(type, 'neutral')).toEqual({
          x: col * 25,
          y: row * 25,
          w: 25,
          h: 25,
        });
        expect(getItemSpriteRect(type, 'dangerous')).toEqual({
          x: (col + 7) * 25,
          y: row * 25,
          w: 25,
          h: 25,
        });
      }

      // Lollipop color variants: green [1,49], red [2,49], blue [1,50]
      expect(getItemSpriteRect('Lollipop', 'neutral', 'red')).toEqual({
        x: 2 * 25,
        y: 49 * 25,
        w: 25,
        h: 25,
      });
      expect(getItemSpriteRect('Lollipop', 'dangerous', 'blue')).toEqual({
        x: (1 + 7) * 25,
        y: 50 * 25,
        w: 25,
        h: 25,
      });
    });

    it('maps S_ItemGlow [10, 51] and S_Empty [4, 1]', () => {
      expect(SPECIAL_SPRITES.S_ItemGlow).toEqual({
        x: 10 * 25,
        y: 51 * 25,
        w: 25,
        h: 25,
      });
      expect(SPECIAL_SPRITES.S_Empty).toEqual({
        x: 4 * 25,
        y: 1 * 25,
        w: 25,
        h: 25,
      });
    });

    it('maps all banner rects including fixed I_theEnd at (350, 650, 1000, 650)', () => {
      expect(BANNER_SPRITES.I_gameOver).toEqual({ x: 350, y: 0, w: 1000, h: 650 });
      expect(BANNER_SPRITES.I_theEnd).toEqual({ x: 350, y: 650, w: 1000, h: 650 });
      expect(BANNER_SPRITES.I_mainLogo).toEqual({ x: 1350, y: 1050, w: 500, h: 137 });
      expect(BANNER_SPRITES.I_soundSlider).toEqual({ x: 0, y: 1475, w: 227, h: 24 });
      expect(BANNER_SPRITES.I_backButton).toEqual({ x: 1375, y: 1200, w: 70, h: 19 });
    });
  });

  describe('Player walk, death, and 5-tile weapon swing animations', () => {
    it('calculates P1 vs P2 (-13 col offset) and 4 health state row offsets (+0/+1/+2/+3)', () => {
      const states: Array<[HealthState, number]> = [
        ['Normal', 0],
        ['Bruised', 1],
        ['Injured', 2],
        ['Dying', 3],
      ];

      for (const [state, rowOffset] of states) {
        const p1Down = getPlayerWalkFrames(1, Direction.Down, state);
        const p2Down = getPlayerWalkFrames(2, Direction.Down, state);

        expect(p1Down[0]).toEqual({
          x: 47 * 25,
          y: (52 + rowOffset) * 25,
          w: 25,
          h: 25,
        });
        expect(p2Down[0]).toEqual({
          x: (47 - 13) * 25,
          y: (52 + rowOffset) * 25,
          w: 25,
          h: 25,
        });

        const p1Left = getPlayerWalkFrames(1, Direction.Left, state);
        expect(p1Left[0].y).toBe((57 + rowOffset) * 25);
      }

      // Idle down frame uses col 48 for P1 and col 35 for P2
      expect(getPlayerIdleSpriteRect(1, Direction.Down, 'Normal')).toEqual({
        x: 48 * 25,
        y: 52 * 25,
        w: 25,
        h: 25,
      });
      expect(getPlayerIdleSpriteRect(2, Direction.Down, 'Injured')).toEqual({
        x: 35 * 25,
        y: 54 * 25,
        w: 25,
        h: 25,
      });
    });

    it('calculates directional death animations for P1 and P2', () => {
      const p1DeathDown = getPlayerDeathFrames(1, Direction.Down);
      const p2DeathDown = getPlayerDeathFrames(2, Direction.Down);
      expect(p1DeathDown[0]).toEqual({ x: 55 * 25, y: 52 * 25, w: 25, h: 25 });
      expect(p2DeathDown[0]).toEqual({ x: (55 - 13) * 25, y: 52 * 25, w: 25, h: 25 });

      expect(getPlayerDeathFrames(1, Direction.Up)[0].y).toBe(53 * 25);
      expect(getPlayerDeathFrames(1, Direction.Right)[0].y).toBe(54 * 25);
      expect(getPlayerDeathFrames(1, Direction.Left)[0].y).toBe(55 * 25);
    });

    it('calculates 5-tile weapon swing animations for Broom (+22), Plunger (+29), FryingPan (+36), health states (+0/+6/+12/+18), and P2 (+24)', () => {
      const weaponOffsets: Array<[WeaponType, number]> = [
        ['Broom', 22],
        ['Plunger', 29],
        ['FryingPan', 36],
      ];

      for (const [weapon, rowOffset] of weaponOffsets) {
        const swingP1 = getWeaponSwingFrames(1, weapon, Direction.Left, 'Normal');
        // playerActLeft base frame 0 is [0, 0] -> [0, rowOffset]
        expect(swingP1.playerTile[0]).toEqual({
          x: 0 * 25,
          y: rowOffset * 25,
          w: 25,
          h: 25,
        });
        // upActLeft base frame 0 is [0, -1] -> [0, rowOffset - 1]
        expect(swingP1.upTile[0]).toEqual({
          x: 0 * 25,
          y: (rowOffset - 1) * 25,
          w: 25,
          h: 25,
        });
        // leftActLeft base frame 1 is [1, 0] -> [1, rowOffset]
        expect(swingP1.leftTile[1]).toEqual({
          x: 1 * 25,
          y: rowOffset * 25,
          w: 25,
          h: 25,
        });
      }

      // Health state column offsets on playerTile (+0, +6, +12, +18) and P2 evil offset (+24)
      const bruisedP1 = getWeaponSwingFrames(1, 'Broom', Direction.Left, 'Bruised');
      expect(bruisedP1.playerTile[0].x).toBe(6 * 25);
      // Last recovery frame row is 13 for Bruised
      expect(
        bruisedP1.playerTile[bruisedP1.playerTile.length - 1].y
      ).toBe(13 * 25);

      const dyingP2 = getWeaponSwingFrames(2, 'FryingPan', Direction.Left, 'Dying');
      // Dying (+18) + P2 (+24) = 42 on frame 0
      expect(dyingP2.playerTile[0].x).toBe((18 + 24) * 25);
      expect(dyingP2.playerTile[0].y).toBe(36 * 25);
      // Adjacent tiles for P2 also get +24 col offset
      expect(dyingP2.leftTile[1].x).toBe((1 + 24) * 25);
    });
  });

  describe('Blobby, EvilLamp, Fire, and DimensionTear animations', () => {
    it('maps Blobby directional animations across cols 60..64, rows 52..56 with horizontal flip flag', () => {
      const left = getBlobbyAnimFrames(Direction.Left);
      const right = getBlobbyAnimFrames(Direction.Right);
      const up = getBlobbyAnimFrames(Direction.Up);
      const down = getBlobbyAnimFrames(Direction.Down);
      const upLeft = getBlobbyAnimFrames(Direction.UpLeft);
      const upRight = getBlobbyAnimFrames(Direction.UpRight);
      const downLeft = getBlobbyAnimFrames(Direction.DownLeft);
      const downRight = getBlobbyAnimFrames(Direction.DownRight);

      expect(left.flipX).toBe(true);
      expect(right.flipX).toBe(false);
      expect(left.frames[0]).toEqual({ x: 60 * 25, y: 53 * 25, w: 25, h: 25 });

      expect(down.flipX).toBe(false);
      expect(down.frames[0]).toEqual({ x: 60 * 25, y: 52 * 25, w: 25, h: 25 });

      expect(up.flipX).toBe(false);
      expect(up.frames[0]).toEqual({ x: 60 * 25, y: 55 * 25, w: 25, h: 25 });

      expect(upLeft.flipX).toBe(true);
      expect(upRight.flipX).toBe(false);
      expect(upLeft.frames[0].y).toBe(54 * 25);

      expect(downLeft.flipX).toBe(false);
      expect(downRight.flipX).toBe(true);
      expect(downRight.frames[0].y).toBe(56 * 25);
    });

    it('maps EvilLamp neutral orange (cols 60..65, row 50) and dangerous green (cols 66..71, row 50)', () => {
      const neutralFrames = getEvilLampFrames('neutral', 'opening');
      const dangerousFrames = getEvilLampFrames('dangerous', 'opening');

      expect(neutralFrames).toHaveLength(6);
      expect(neutralFrames[0]).toEqual({ x: 60 * 25, y: 50 * 25, w: 25, h: 25 });
      expect(neutralFrames[5]).toEqual({ x: 65 * 25, y: 50 * 25, w: 25, h: 25 });

      expect(dangerousFrames).toHaveLength(6);
      expect(dangerousFrames[0]).toEqual({ x: 66 * 25, y: 50 * 25, w: 25, h: 25 });
      expect(dangerousFrames[5]).toEqual({ x: 71 * 25, y: 50 * 25, w: 25, h: 25 });

      const dormantLamp: EvilLampEntity = {
        id: 'el-1',
        world: 'dangerous',
        x: 50,
        y: 50,
        gid: 3402,
        isOn: true,
        linkedLampId: null,
        stage: 'dormant',
        timerMs: 0,
        popUpText: '',
      };
      expect(getEvilLampSpriteRect(dormantLamp, 0)).toEqual({
        x: 66 * 25,
        y: 50 * 25,
        w: 25,
        h: 25,
      });
      const attackingLamp: EvilLampEntity = {
        ...dormantLamp,
        stage: 'attacking',
      };
      expect(getEvilLampSpriteRect(attackingLamp, 100)).toEqual({
        x: 71 * 25,
        y: 50 * 25,
        w: 25,
        h: 25,
      });
    });

    it('maps Fire active red/orange (cols 60..62, row 57) and off/pilot blue soul-flame (cols 65..69, row 57)', () => {
      const activeFire = getFireAnimFrames(true);
      const pilotFire = getFireAnimFrames(false);

      expect(activeFire[0]).toEqual({ x: 60 * 25, y: 57 * 25, w: 25, h: 25 });
      expect(activeFire[activeFire.length - 1]).toEqual({
        x: 62 * 25,
        y: 57 * 25,
        w: 25,
        h: 25,
      });

      expect(pilotFire[0]).toEqual({ x: 65 * 25, y: 57 * 25, w: 25, h: 25 });
      expect(pilotFire[pilotFire.length - 1]).toEqual({
        x: 69 * 25,
        y: 57 * 25,
        w: 25,
        h: 25,
      });
    });

    it('maps DimensionTear 5-stage animations and rotation degrees (0, 90, 180, 270)', () => {
      const upStage0 = getDimensionTearAnim(Direction.Up, 0);
      expect(upStage0.family).toBe('orthoSpread');
      expect(upStage0.rotationDeg).toBe(0);
      expect(upStage0.frames[0]).toEqual({ x: 0 * 25, y: 54 * 25, w: 25, h: 25 });

      const rightStage4 = getDimensionTearAnim(Direction.Right, 4);
      expect(rightStage4.family).toBe('orthoSpread');
      expect(rightStage4.rotationDeg).toBe(90);
      expect(rightStage4.frames[0]).toEqual({ x: 12 * 25, y: 54 * 25, w: 25, h: 25 });

      const downStage2 = getDimensionTearAnim(Direction.Down, 2);
      expect(downStage2.rotationDeg).toBe(180);

      const leftStage1 = getDimensionTearAnim(Direction.Left, 1);
      expect(leftStage1.rotationDeg).toBe(270);

      const upRightDiag = getDimensionTearAnim(Direction.UpRight, 0);
      expect(upRightDiag.family).toBe('diagonalSpread');
      expect(upRightDiag.rotationDeg).toBe(0);
      expect(upRightDiag.frames[0].y).toBe(57 * 25);

      const downRightDiag = getDimensionTearAnim(Direction.DownRight, 1);
      expect(downRightDiag.family).toBe('diagonalSpread');
      expect(downRightDiag.rotationDeg).toBe(90);

      const downLeftDiag = getDimensionTearAnim(Direction.DownLeft, 2);
      expect(downLeftDiag.rotationDeg).toBe(180);

      const upLeftDiag = getDimensionTearAnim(Direction.UpLeft, 3);
      expect(upLeftDiag.rotationDeg).toBe(270);

      const horiz = getDimensionTearAnim(Direction.Horizontal, 0);
      expect(horiz.family).toBe('spawnHorizontal');
      expect(horiz.rotationDeg).toBe(0);
      expect(horiz.frames[0]).toEqual({ x: 19 * 25, y: 53 * 25, w: 25, h: 25 });

      const vert = getDimensionTearAnim(Direction.Vertical, 4);
      expect(vert.family).toBe('spawnVertical');
      expect(vert.rotationDeg).toBe(0);
      expect(vert.frames[0]).toEqual({ x: 16 * 25, y: 56 * 25, w: 25, h: 25 });
    });
  });
});
