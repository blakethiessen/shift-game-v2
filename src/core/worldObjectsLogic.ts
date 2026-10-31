// src/core/worldObjectsLogic.ts
// Pure TypeScript puzzle and world object logic: PressurePlates ('chest', 'door', 'safe'),
// Chest rewards, Safe & BlueGem in safeRoom, Levers, Fires, Lamps, and Door transitions.

import {
  ChestEntity,
  DoorEntity,
  EvilLampEntity,
  GameState,
  getWorldForSide,
  ItemData,
  ItemType,
  LampEntity,
  LeverEntity,
  PlayerState,
  RoomState,
  TILE_SIZE_PX,
  Vector2D,
  WorldType,
} from '../shared/types';
import { getDefaultItemGid, getDefaultItemPopUpText } from './levelParser';
import { emitEvent, takeDamage } from './playerLogic';

const CHEST_REWARD_BY_ROOM: Record<string, ItemType> = {
  bigEnemiesRoom: 'GreenGem',
  chestIntro: 'Key',
  crossyRoom: 'Key',
  spiralCombo: 'Key',
  theEyes: 'Key',
  roomOfRooms: 'WaterBottle',
  lanternGet: 'Lantern',
  sadLovelyLamps: 'Sandwich',
  threesCompany: 'Sandwich',
  safeRoom: 'BlueGem',
  tooMany: 'Flashlight2',
};

function rectsOverlap(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number
): boolean {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

export function areAllLeversActivated(room: RoomState): boolean {
  const allLevers = [
    ...room.worlds.neutral.levers,
    ...room.worlds.dangerous.levers,
  ];
  return allLevers.every((l) => l.activated);
}

export function activateChest(state: GameState, chest: ChestEntity): void {
  chest.opened = true;
  const persist = state.persistence[state.roomName];

  if (!chest.used) {
    const rewardType = CHEST_REWARD_BY_ROOM[state.roomName];
    if (rewardType) {
      const rewardX = chest.x;
      const rewardY = chest.y + TILE_SIZE_PX;
      const itemData: ItemData = {
        id: `${state.roomName}_chest_reward_${rewardType}_${chest.world}_${state.tick}`,
        type: rewardType,
        popUpText: getDefaultItemPopUpText(rewardType),
      };
      state.room.worlds[chest.world].items.push({
        id: itemData.id,
        world: chest.world,
        x: rewardX,
        y: rewardY,
        gid: getDefaultItemGid(rewardType, chest.world),
        item: itemData,
      });
      if (persist) {
        persist.addedItems.push({
          id: itemData.id,
          world: chest.world,
          x: rewardX,
          y: rewardY,
          item: { ...itemData },
        });
      }
    }
    chest.used = true;
  }

  if (persist) {
    persist.chests[chest.id] = {
      opened: chest.opened,
      used: chest.used,
    };
  }
}

export function deactivateChest(state: GameState, chest: ChestEntity): void {
  chest.opened = false;
  const persist = state.persistence[state.roomName];
  if (persist) {
    persist.chests[chest.id] = {
      opened: chest.opened,
      used: chest.used,
    };
  }
}

export function openSafesInRoom(state: GameState): void {
  if (state.safePressurePlatesPressed < 2) return;

  const allSafes = [
    ...state.room.worlds.neutral.safes,
    ...state.room.worlds.dangerous.safes,
  ];
  if (allSafes.length === 0) return;

  const persist = state.persistence[state.roomName];
  let anyNewlyOpened = false;

  for (const safe of allSafes) {
    if (!safe.opened) {
      safe.opened = true;
      anyNewlyOpened = true;

      const rewardX = safe.x;
      const rewardY = safe.y + TILE_SIZE_PX;
      const alreadyHasGem = state.room.worlds[safe.world].items.some(
        (i) =>
          i.item.type === 'BlueGem' && i.x === rewardX && i.y === rewardY
      );
      if (!alreadyHasGem) {
        const gemData: ItemData = {
          id: `${state.roomName}_safe_blueGem_${safe.world}`,
          type: 'BlueGem',
          popUpText: getDefaultItemPopUpText('BlueGem'),
        };
        state.room.worlds[safe.world].items.push({
          id: gemData.id,
          world: safe.world,
          x: rewardX,
          y: rewardY,
          gid: getDefaultItemGid('BlueGem', safe.world),
          item: gemData,
        });
        if (persist) {
          persist.addedItems.push({
            id: gemData.id,
            world: safe.world,
            x: rewardX,
            y: rewardY,
            item: { ...gemData },
          });
        }
      }
    }
  }

  if (anyNewlyOpened) {
    if (persist) {
      persist.safeOpened = true;
    }
    emitEvent(state, {
      type: 'playSound',
      sound: 'safeOpening',
    });
  }
}

export function toggleLamp(
  state: GameState,
  lamp: LampEntity | EvilLampEntity
): void {
  const newIsOn = !lamp.isOn;
  lamp.isOn = newIsOn;

  const otherWorld: WorldType =
    lamp.world === 'neutral' ? 'dangerous' : 'neutral';
  const otherGrid = state.room.worlds[otherWorld];

  if (lamp.linkedLampId) {
    const linkedNormal = otherGrid.lamps.find(
      (l) => l.id === lamp.linkedLampId
    );
    if (linkedNormal && !linkedNormal.isBroken) {
      linkedNormal.isOn = newIsOn;
    }
    const linkedEvil = otherGrid.evilLamps.find(
      (el) => el.id === lamp.linkedLampId
    );
    if (linkedEvil) {
      linkedEvil.isOn = newIsOn;
    }
  }

  const persist = state.persistence[state.roomName];
  if (persist) {
    persist.lamps = [
      ...state.room.worlds.neutral.lamps.map((l) => ({
        world: l.world,
        x: l.x,
        y: l.y,
        isOn: l.isOn,
      })),
      ...state.room.worlds.dangerous.lamps.map((l) => ({
        world: l.world,
        x: l.x,
        y: l.y,
        isOn: l.isOn,
      })),
      ...state.room.worlds.dangerous.evilLamps.map((el) => ({
        world: el.world,
        x: el.x,
        y: el.y,
        isOn: el.isOn,
      })),
    ];
  }
}

export function toggleLever(
  state: GameState,
  lever: LeverEntity,
  player: PlayerState
): void {
  lever.activated = !lever.activated;
  emitEvent(state, {
    type: 'playSound',
    sound: lever.activated ? 'leverOn' : 'leverOff',
    playerId: player.id,
    side: player.side,
    world: lever.world,
  });

  // Update Fire1 and Fire2 across both worlds
  for (const fire of [
    ...state.room.worlds.neutral.fires,
    ...state.room.worlds.dangerous.fires,
  ]) {
    if (fire.variant === 1) {
      fire.isOn = !lever.activated;
    } else {
      fire.isOn = lever.activated;
    }
    if (!fire.isOn) {
      fire.damageTimerMs = 0;
    }
  }

  // Toggle chests if present in room
  const allChests = [
    ...state.room.worlds.neutral.chests,
    ...state.room.worlds.dangerous.chests,
  ];
  for (const chest of allChests) {
    if (chest.opened) {
      deactivateChest(state, chest);
    } else if (
      state.room.chestPressurePlatesPressed >=
        state.room.chestPressurePlatesToPress &&
      areAllLeversActivated(state.room)
    ) {
      activateChest(state, chest);
    }
  }
}

function isPlayerTouchingDoor(player: PlayerState, door: DoorEntity): boolean {
  // Check if player's [3,3]..[22,22] box expanded by 2px overlaps the door's 25x25 tile
  return rectsOverlap(
    player.x + 1,
    player.y + 1,
    player.x + 24,
    player.y + 24,
    door.x,
    door.y,
    door.x + TILE_SIZE_PX,
    door.y + TILE_SIZE_PX
  );
}

export function updateWorldObjectsAndDoors(
  state: GameState,
  dtMs: number,
  onRoomTransition: (
    nextRoomName: string,
    p1Pos: Vector2D,
    p2Pos: Vector2D
  ) => void
): void {
  const persist = state.persistence[state.roomName];

  // 1. Pressure Plates ('chest', 'door', 'safe')
  const allPlates = [
    ...state.room.worlds.neutral.pressurePlates,
    ...state.room.worlds.dangerous.pressurePlates,
  ];

  for (const plate of allPlates) {
    const grid = state.room.worlds[plate.world];
    const isOverlapped = grid.boxes.some((box) =>
      rectsOverlap(
        box.x + 1,
        box.y + 1,
        box.x + 24,
        box.y + 24,
        plate.x,
        plate.y,
        plate.x + TILE_SIZE_PX,
        plate.y + TILE_SIZE_PX
      )
    );

    if (plate.kind === 'chest') {
      if (!plate.touched && isOverlapped) {
        plate.touched = true;
        state.room.chestPressurePlatesPressed++;

        if (
          state.room.chestPressurePlatesPressed >=
            state.room.chestPressurePlatesToPress &&
          areAllLeversActivated(state.room)
        ) {
          for (const chest of [
            ...state.room.worlds.neutral.chests,
            ...state.room.worlds.dangerous.chests,
          ]) {
            emitEvent(state, {
              type: 'playSound',
              sound: 'doorUnlocking',
              world: chest.world,
            });
            activateChest(state, chest);
          }
        }
      } else if (plate.touched === true && !isOverlapped) {
        plate.touched = false;
        state.room.chestPressurePlatesPressed = Math.max(
          0,
          state.room.chestPressurePlatesPressed - 1
        );
        for (const chest of [
          ...state.room.worlds.neutral.chests,
          ...state.room.worlds.dangerous.chests,
        ]) {
          emitEvent(state, {
            type: 'playSound',
            sound: 'doorLocking',
            world: chest.world,
          });
          deactivateChest(state, chest);
        }
      }
    } else if (plate.kind === 'door') {
      if (!plate.touched && isOverlapped) {
        plate.touched = true;
        for (const door of [
          ...state.room.worlds.neutral.doors,
          ...state.room.worlds.dangerous.doors,
        ]) {
          if (door.kind === 'PressureDoor') {
            door.unlocked = true;
          }
        }
        emitEvent(state, {
          type: 'playSound',
          sound: 'doorUnlocking',
          world: plate.world,
        });
      } else if (plate.touched === true && !isOverlapped) {
        plate.touched = false;
        const anyOtherDoorPlatePressed = allPlates.some(
          (p) => p.kind === 'door' && p.touched
        );
        if (!anyOtherDoorPlatePressed) {
          for (const door of [
            ...state.room.worlds.neutral.doors,
            ...state.room.worlds.dangerous.doors,
          ]) {
            if (door.kind === 'PressureDoor') {
              door.unlocked = false;
            }
          }
        }
      }
    } else if (plate.kind === 'safe') {
      if (!plate.touched && isOverlapped) {
        plate.touched = true;
        if (persist && !persist.safePlatesPressedIds.includes(plate.id)) {
          persist.safePlatesPressedIds.push(plate.id);
          state.safePressurePlatesPressed++;
        }
        openSafesInRoom(state);
      } else if (
        plate.touched === true &&
        !isOverlapped &&
        !(persist && persist.safePlatesPressedIds.includes(plate.id))
      ) {
        plate.touched = false;
      }
    }
  }

  // Also ensure safes in safeRoom open if safePressurePlatesPressed >= 2
  openSafesInRoom(state);

  // 2. Active Fires dealing periodic damage (0.5 immediately and every 1000ms)
  for (const player of state.players) {
    if (!player.isAlive) continue;
    const world = getWorldForSide(player.side, state.evilOnLeft);
    const grid = state.room.worlds[world];

    for (const fire of grid.fires) {
      if (!fire.isOn) {
        fire.damageTimerMs = 0;
        continue;
      }

      const overlaps = rectsOverlap(
        player.x + 3,
        player.y + 3,
        player.x + 22,
        player.y + 22,
        fire.x,
        fire.y,
        fire.x + TILE_SIZE_PX,
        fire.y + TILE_SIZE_PX
      );

      if (overlaps) {
        if (fire.damageTimerMs <= 0) {
          takeDamage(state, player.id, 0.5);
          fire.damageTimerMs = 1000;
        } else {
          fire.damageTimerMs -= dtMs;
          if (fire.damageTimerMs <= 0) {
            takeDamage(state, player.id, 0.5);
            fire.damageTimerMs += 1000;
          }
        }
      } else {
        fire.damageTimerMs = 0;
      }
    }
  }

  // 3. Recompute playerAtDoor each tick and check for synchronized room transition
  for (const player of state.players) {
    const world = getWorldForSide(player.side, state.evilOnLeft);
    const grid = state.room.worlds[world];
    let atDoorId: string | null = null;
    for (const door of grid.doors) {
      const touching = isPlayerTouchingDoor(player, door);
      door.playerAtDoor = touching;
      if (touching) {
        atDoorId = door.id;
      }
    }
    player.atDoorId = atDoorId;
  }

  if (state.currentlyShifting) return;

  for (const nDoor of state.room.worlds.neutral.doors) {
    const dDoor = state.room.worlds.dangerous.doors.find(
      (d) => d.id === nDoor.linkedDoorId
    );
    if (!dDoor) continue;

    if (
      nDoor.playerAtDoor &&
      dDoor.playerAtDoor &&
      (nDoor.unlocked || dDoor.unlocked)
    ) {
      if (nDoor.kind === 'FinalDoors' || dDoor.kind === 'FinalDoors') {
        state.phase = 'victory';
        state.phaseTimerMs = 0;
        emitEvent(state, {
          type: 'victory',
        });
        emitEvent(state, {
          type: 'flashScreen',
          color: '#FFFFFF',
          durationMs: 500,
          maxOpacity: 1.0,
        });
        return;
      }

      if (nDoor.connectedRoom && nDoor.connectedDoorPos) {
        const [cx, cy] = nDoor.connectedDoorPos;
        const [px, py] = nDoor.partnerConnectedDoorPos ?? nDoor.connectedDoorPos;
        const dir = nDoor.entranceDirection ?? 0;

        let p1Pos: Vector2D = { x: cx, y: cy };
        let p2Pos: Vector2D = { x: px, y: py };

        switch (dir) {
          case 0:
            p1Pos = { x: cx, y: cy - TILE_SIZE_PX };
            p2Pos = { x: px, y: py - TILE_SIZE_PX };
            break;
          case 1:
            p1Pos = { x: cx + TILE_SIZE_PX, y: cy };
            p2Pos = { x: px + TILE_SIZE_PX, y: py };
            break;
          case 2:
            p1Pos = { x: cx, y: cy + TILE_SIZE_PX };
            p2Pos = { x: px, y: py + TILE_SIZE_PX };
            break;
          case 3:
            p1Pos = { x: cx - TILE_SIZE_PX, y: cy };
            p2Pos = { x: px - TILE_SIZE_PX, y: py };
            break;
        }

        onRoomTransition(nDoor.connectedRoom, p1Pos, p2Pos);
        return;
      }
    }
  }
}
