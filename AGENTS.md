# AGENTS.md — Shift: The Game

Global workflow rules (Autonomy & Reversibility, TDD, Debugging Discipline, Safety Hygiene, Linear Git, Design & Typing, and Tailscale server invariants) are loaded from `~/.gemini/config/AGENTS.md`. Below are project-specific details.

## Project Overview
**Shift: The Game** is a modern TypeScript + Vite rebuild of the 2012 dual-dimension co-op survival horror puzzle game, featuring:
- A deterministic, zero-DOM-dependency TypeScript simulation engine (`src/core/`) running at a fixed 60Hz tick rate.
- A hardware-accelerated 2D Canvas/WebGL renderer (`src/renderer/`) with static/dynamic shadow-casting lighting (`lightingRenderer.ts`) and full spritesheet atlas mapping (`spriteAtlas.ts`).
- Dual play modes: **Local Co-op (`1000x650` split-screen)** and **Online P2P Co-op (`500x650` single-dimension view via PeerJS WebRTC)** (`src/net/`).
- Web Audio API engine (`src/audio/`) with 5-channel pooling, independent player footstep channels, dynamic threat/no-threat music rotation, and a low-pass `BiquadFilterNode` for muffled cross-dimension partner audio in Online Mode.
- Retro `FixedSys` menu & lobby UI (`src/ui/`) and customizable keyboard input (`src/input/`).

The original 2012 Crafty.js v0.6.3 source is preserved untouched as a read-only reference archive in `legacy_original_project/`.

---

## Verification & Quality Gate
- Automated Vitest specs reside in `tests/`.
- Run the full quality gate before completing any task:
  ```bash
  npm run test
  npm run typecheck
  npm run build
  ```

---

## Architecture & Module Boundaries
- `src/shared/types.ts`: Single source of truth for all data models, constants, coordinate helpers, and module interfaces (`IGameEngine`, `IGameRenderer`, `IAudioManager`, `IInputManager`, `IPeerManager`).
- `src/core/`: Pure TypeScript deterministic simulation engine, level parser (`levelData.ts`, `levelParser.ts`), A* pathfinding (`pathfinding.ts`), player/inventory/combat (`playerLogic.ts`), world puzzles (`worldObjectsLogic.ts`), and monsters/tears (`monstersAndTears.ts`). **Zero DOM/Canvas/Browser dependencies.**
- `src/renderer/`: Sprite atlas (`spriteAtlas.ts`), shadow-casting lighting compositor (`lightingRenderer.ts`), and main game renderer (`gameRenderer.ts`) supporting both `1000x650` (Local Dual View) and `500x650` (Online Single-Dimension View).
- `src/net/`: PeerJS WebRTC P2P manager (`peerManager.ts`) implementing Host-authoritative state sync and sequence-numbered client input packets.
- `src/audio/`: Web Audio API sound & music engine (`audioManager.ts`) with 5-channel SFX pooling and muffled cross-dimension low-pass filtering.
- `src/input/`: Keyboard input & keybinding manager (`inputManager.ts`).
- `src/ui/`: Retro `FixedSys` menu, options, and online lobby system (`menuSystem.ts`).
