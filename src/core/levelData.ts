// Auto-extracted from legacy_original_project/scripts/core/levels.js
// Contains all 54 room definitions in Tiled JSON format, hydrated from compact sparse JSON.

import rawLevelBundle from './levelData.json';

export interface RawLevelDoorDef {
  coor: [number, number];
  connectedRoom: string;
  connectedDoor: [number, number];
  entranceDirection: number;
}

export interface RawTiledLayer {
  data: number[];
  height: number;
  width: number;
  name: string;
  opacity: number;
  type: string;
  visible: boolean;
  x: number;
  y: number;
  properties?: Record<string, string>;
}

export interface RawTiledTileset {
  firstgid: number;
  image: string;
  imageheight: number;
  imagewidth: number;
  margin: number;
  name: string;
  properties?: Record<string, string>;
  spacing: number;
  tileheight: number;
  tilewidth: number;
  tileproperties?: Record<string, Record<string, string>>;
}

export interface RawTiledMap {
  height: number;
  width: number;
  layers: RawTiledLayer[];
  orientation: string;
  properties: Record<string, string>;
  tileheight: number;
  tilesets: RawTiledTileset[];
  tilewidth: number;
  version: number;
}

export interface RawRoomDefinition {
  doors: RawLevelDoorDef[];
  room: RawTiledMap;
}

interface CompactLayerEntry {
  n: string;
  w: number;
  h: number;
  len: number;
  s: number[];
  p?: Record<string, string>;
}

interface CompactRoomEntry {
  d: RawLevelDoorDef[];
  p: Record<string, string>;
  l: CompactLayerEntry[];
}

interface CompactLevelBundle {
  tilesets: RawTiledTileset[];
  rooms: Record<string, CompactRoomEntry>;
}

function inflateLayer(entry: CompactLayerEntry): RawTiledLayer {
  const data = new Array<number>(entry.len).fill(0);
  const sparse = entry.s;
  for (let i = 0; i < sparse.length; i += 2) {
    data[sparse[i]] = sparse[i + 1];
  }
  const layer: RawTiledLayer = {
    data,
    height: entry.h,
    width: entry.w,
    name: entry.n,
    opacity: 1,
    type: 'tilelayer',
    visible: true,
    x: 0,
    y: 0,
  };
  if (entry.p) {
    layer.properties = entry.p;
  }
  return layer;
}

function inflateLevels(bundle: CompactLevelBundle): Record<string, RawRoomDefinition> {
  const result: Record<string, RawRoomDefinition> = {};
  for (const [roomName, roomEntry] of Object.entries(bundle.rooms)) {
    result[roomName] = {
      doors: roomEntry.d as RawLevelDoorDef[],
      room: {
        height: 26,
        layers: roomEntry.l.map(inflateLayer),
        orientation: 'orthogonal',
        properties: roomEntry.p,
        tileheight: 25,
        tilesets: bundle.tilesets,
        tilewidth: 25,
        version: 1,
        width: 40,
      },
    };
  }
  return result;
}

export const RAW_LEVELS: Record<string, RawRoomDefinition> = inflateLevels(
  rawLevelBundle as unknown as CompactLevelBundle
);
