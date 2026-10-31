# AGENTS.md — Shift: The Game

## Project Overview
**Shift: The Game** is a modern TypeScript + Vite rebuild of the 2012 dual-dimension co-op survival horror puzzle game, featuring:
- A deterministic, zero-DOM-dependency TypeScript simulation engine (`src/core/`) running at a fixed 60Hz tick rate.
- A hardware-accelerated 2D Canvas/WebGL renderer (`src/renderer/`) with static/dynamic shadow-casting lighting (`lightingRenderer.ts`) and full spritesheet atlas mapping (`spriteAtlas.ts`).
- Dual play modes: **Local Co-op (`1000x650` split-screen)** and **Online P2P Co-op (`500x650` single-dimension view via PeerJS WebRTC)** (`src/net/`).
- Web Audio API engine (`src/audio/`) with 5-channel pooling, independent player footstep channels, dynamic threat/no-threat music rotation, and a low-pass `BiquadFilterNode` for muffled cross-dimension partner audio in Online Mode.
- Retro `FixedSys` menu & lobby UI (`src/ui/`) and customizable keyboard input (`src/input/`).

The original 2012 Crafty.js v0.6.3 source is preserved untouched as a read-only reference archive in `legacy_original_project/`.

---

## Default Development Workflow: Test-Driven Development (TDD)
Across all modules and workstreams in this repository, follow a strict **Test-Driven Development (TDD)** workflow for all new features, enhancements, behavioral changes, and bug fixes:

1. **Step 1: Write Tests First (Red)**
   - Before writing or modifying any implementation code, write or update automated Vitest tests in `tests/` defining the exact expected behavior, edge cases, and public interface contracts.
   - Run `npm test` and confirm that the new test fails or fails to compile against the missing feature/bug fix.

2. **Step 2: Implement Minimum Code (Green)**
   - Implement the minimal production code necessary to satisfy the test specifications.
   - Run `npm test` to verify that the newly written tests now pass cleanly.

3. **Step 3: Refactor & Verify (Clean & Regress-Free)**
   - Refactor and optimize the code for readability, performance, and maintainability while keeping all tests passing.
   - Run the full quality gate before completing any task:
     ```bash
     npm run test
     npm run typecheck
     npm run build
     ```

---

## Mandatory Git Workflow: Linear History (Rebase & Fast-Forward Only)
Maintain a clean, linear git history with **zero merge commits** (`"Merge branch..."`):

1. **Never create merge commits** on `main` or `master`. Do not run plain `git merge <branch>` without `--ff-only`.
2. **Rebase feature branches onto latest `main`**:
   - Before integrating any branch or worktree, rebase onto `main` (`git rebase main`).
   - Resolve any conflicts on the branch, run the full test suite (`npm test && npm run typecheck`), and ensure tests pass cleanly on top of the rebased commits.
3. **Fast-forward only (`--ff-only`)**:
   - Merge branches into `main` using fast-forward only: `git merge --ff-only <branch>`.
   - If combining multiple work-in-progress commits into a single clean commit, use squash merge (`git merge --squash <branch> && git commit`).

---

## Remote Development & Tailscale Web Server Invariants
The primary development workstation runs remotely and connects via Tailscale (`tail80acff.ts.net`). Web applications are tested remotely over the Tailnet:

1. **Host Binding & Accessibility (`--host` / `0.0.0.0`)**:
   - Web development and preview servers must **always** be started listening on all network interfaces (`--host 0.0.0.0`), never restricted to `localhost` / `127.0.0.1`.
2. **Allowed Hosts Configuration (`allowedHosts: true`)**:
   - `vite.config.ts` must always configure `allowedHosts: true` in both `server` and `preview` blocks to prevent DNS rebinding host blocks on `*.ts.net`.
3. **Tailscale Serve & HTTPS**:
   - When setting up remote preview links, proxy them through **Tailscale Serve** with HTTPS enabled (`tailscale serve --bg --https=<PORT> http://127.0.0.1:<LOCAL_PORT>`).
   - Always verify active serve mappings with `tailscale serve status` before configuring new routes to avoid port collisions.
4. **URL Reporting**:
   - When reporting URLs to the user, always provide the remote Tailscale links (e.g. `https://bazzite.tail80acff.ts.net:<PORT>/`).

---

## Architecture & Module Boundaries
- `src/shared/types.ts`: Single source of truth for all data models, constants, coordinate helpers, and module interfaces (`IGameEngine`, `IGameRenderer`, `IAudioManager`, `IInputManager`, `IPeerManager`). Avoid `any` in production code.
- `src/core/`: Pure TypeScript deterministic simulation engine, level parser (`levelData.ts`, `levelParser.ts`), A* pathfinding (`pathfinding.ts`), player/inventory/combat (`playerLogic.ts`), world puzzles (`worldObjectsLogic.ts`), and monsters/tears (`monstersAndTears.ts`). **Zero DOM/Canvas/Browser dependencies.**
- `src/renderer/`: Sprite atlas (`spriteAtlas.ts`), shadow-casting lighting compositor (`lightingRenderer.ts`), and main game renderer (`gameRenderer.ts`) supporting both `1000x650` (Local Dual View) and `500x650` (Online Single-Dimension View).
- `src/net/`: PeerJS WebRTC P2P manager (`peerManager.ts`) implementing Host-authoritative state sync and sequence-numbered client input packets.
- `src/audio/`: Web Audio API sound & music engine (`audioManager.ts`) with 5-channel SFX pooling and muffled cross-dimension low-pass filtering.
- `src/input/`: Keyboard input & keybinding manager (`inputManager.ts`).
- `src/ui/`: Retro `FixedSys` menu, options, and online lobby system (`menuSystem.ts`).
