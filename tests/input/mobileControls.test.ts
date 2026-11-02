// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputManager } from '../../src/input/inputManager';
import {
  MobileControls,
  computeJoystickState,
  computeLocalCoopStationRotations,
  detectDevicePlatform,
  transformScreenDeltaToLocal,
} from '../../src/input/mobileControls';

describe('MobileControls', () => {
  describe('Coordinate Transformation & 8-Way Thumbstick Math', () => {
    it('transforms screen pointer deltas into local station coordinates across 0, 180, 90, and -90 deg rotations', () => {
      // 0 deg (Bottom player in Portrait / Online player)
      expect(transformScreenDeltaToLocal(30, -40, 0)).toEqual({ x: 30, y: -40 });

      // 180 deg (Top player in Portrait, facing opposite end)
      // Pushing away from top edge (+y on screen) is Up (-y local)
      // Pushing toward top-left of screen (-x on screen) is Right (+x local)
      expect(transformScreenDeltaToLocal(-30, 40, 180)).toEqual({ x: 30, y: -40 });

      // 90 deg CW (Left player in Landscape, holding left short end facing right)
      // Pushing away from left edge (+x on screen) is Up (-y local)
      // Pushing toward bottom-left of screen (+y on screen, P1 right thumb) is Right (+x local)
      expect(transformScreenDeltaToLocal(40, 30, 90)).toEqual({ x: 30, y: -40 });

      // -90 deg CCW (Right player in Landscape, holding right short end facing left)
      // Pushing away from right edge (-x on screen) is Up (-y local)
      // Pushing toward top-right of screen (-y on screen, P2 right thumb) is Right (+x local)
      expect(transformScreenDeltaToLocal(-40, -30, -90)).toEqual({ x: 30, y: -40 });
    });

    it('computes 8-way directional states, deadzone filtering, and clamped knob coordinates', () => {
      // Inside deadzone (r < 10)
      const idle = computeJoystickState(4, -3, 38, 10);
      expect(idle).toMatchObject({
        up: false,
        down: false,
        left: false,
        right: false,
        magnitude: 0,
      });

      // Pure Up
      expect(computeJoystickState(0, -30, 38, 10)).toMatchObject({
        up: true,
        down: false,
        left: false,
        right: false,
      });

      // Pure Right
      expect(computeJoystickState(30, 0, 38, 10)).toMatchObject({
        up: false,
        down: false,
        left: false,
        right: true,
      });

      // Diagonal Up-Right (45 deg)
      const upRight = computeJoystickState(50, -50, 38, 10);
      expect(upRight).toMatchObject({
        up: true,
        down: false,
        left: false,
        right: true,
      });
      // Clamped to maxRadius (38)
      expect(Math.hypot(upRight.knobX, upRight.knobY)).toBeCloseTo(38, 1);

      // Diagonal Down-Left
      expect(computeJoystickState(-35, 35, 38, 10)).toMatchObject({
        up: false,
        down: true,
        left: true,
        right: false,
      });
    });

    it('computes head-to-head 180-degree opposite station rotations for both Landscape and Portrait phones', () => {
      // Landscape phone (844x390): Left short end (90 deg) vs Right short end (-90 deg)
      const landscape = computeLocalCoopStationRotations(844, 390);
      expect(landscape.splitAxis).toBe('horizontal');
      expect(landscape.p1RotationDeg).toBe(90);
      expect(landscape.p2RotationDeg).toBe(-90);
      expect(Math.abs(landscape.p1RotationDeg - landscape.p2RotationDeg)).toBe(180);

      // Portrait phone (390x844): Bottom short end (0 deg) vs Top short end (180 deg)
      const portrait = computeLocalCoopStationRotations(390, 844);
      expect(portrait.splitAxis).toBe('vertical');
      expect(portrait.p1RotationDeg).toBe(0);
      expect(portrait.p2RotationDeg).toBe(180);
      expect(Math.abs(portrait.p1RotationDeg - portrait.p2RotationDeg)).toBe(180);

      // PC platform: Always side-by-side upright (0 deg / 0 deg, horizontal split), never facing off
      const pcLandscape = computeLocalCoopStationRotations(1920, 1080, 'pc');
      expect(pcLandscape).toEqual({
        splitAxis: 'horizontal',
        p1RotationDeg: 0,
        p2RotationDeg: 0,
      });
      const pcPortrait = computeLocalCoopStationRotations(900, 1200, 'pc');
      expect(pcPortrait).toEqual({
        splitAxis: 'horizontal',
        p1RotationDeg: 0,
        p2RotationDeg: 0,
      });
    });

    it('accurately discerns PC vs Mobile platform even when a PC reports maxTouchPoints > 0', () => {
      // Linux / Windows PC with maxTouchPoints > 0 and fine mouse pointer -> 'pc'
      expect(
        detectDevicePlatform({
          userAgent:
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          platform: 'Linux x86_64',
          maxTouchPoints: 10,
          userAgentDataMobile: false,
          matchMedia: (q) => ({
            matches: q === '(hover: hover) and (pointer: fine)',
          }),
        })
      ).toBe('pc');

      // Windows desktop where maxTouchPoints is 1 (e.g. touchscreen monitor or virtual driver) -> 'pc'
      expect(
        detectDevicePlatform({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          platform: 'Win32',
          maxTouchPoints: 1,
          matchMedia: (q) => ({
            matches: q === '(hover: hover) and (pointer: fine)',
          }),
        })
      ).toBe('pc');

      // Android Phone -> 'mobile'
      expect(
        detectDevicePlatform({
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
          platform: 'Linux armv81',
          maxTouchPoints: 5,
          userAgentDataMobile: true,
          matchMedia: (q) => ({
            matches: q === '(pointer: coarse)',
          }),
        })
      ).toBe('mobile');

      // iPhone -> 'mobile'
      expect(
        detectDevicePlatform({
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          platform: 'iPhone',
          maxTouchPoints: 5,
        })
      ).toBe('mobile');

      // iPadOS 13+ requesting desktop site (MacIntel + maxTouchPoints > 1 + coarse pointer) -> 'mobile'
      expect(
        detectDevicePlatform({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
          matchMedia: (q) => ({
            matches: q === '(pointer: coarse)',
          }),
        })
      ).toBe('mobile');

      // URL query overrides (?platform=mobile, ?platform=pc, ?mobile=0)
      expect(
        detectDevicePlatform({
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
          urlSearch: '?platform=mobile',
        })
      ).toBe('mobile');
      expect(
        detectDevicePlatform({
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
          urlSearch: '?platform=pc',
        })
      ).toBe('pc');
    });
  });

  describe('DOM Rendering & Multi-Touch Interaction (Local Head-to-Head & Online)', () => {
    let container: HTMLElement;
    let input: InputManager;
    let mobile: MobileControls;

    beforeEach(() => {
      vi.useFakeTimers();
      container = document.createElement('div');
      document.body.appendChild(container);
      input = new InputManager({ mode: 'local', localPlayerId: 1 });
      input.setEnabled(true);
    });

    afterEach(() => {
      mobile?.destroy();
      input.destroy();
      container.remove();
      vi.useRealTimers();
    });

    it('renders two opposite head-to-head Player Stations in Local Mode with left-thumb joystick and right-thumb action/shift buttons', () => {
      mobile = new MobileControls({
        container,
        inputManager: input,
        forceEnabled: true,
        viewportSizeProvider: () => ({ width: 844, height: 390 }),
      });

      mobile.setSessionMode('local', 1, true);

      const station1 = container.querySelector('[data-testid="mobile-station-p1"]') as HTMLElement;
      const station2 = container.querySelector('[data-testid="mobile-station-p2"]') as HTMLElement;
      expect(station1).toBeTruthy();
      expect(station2).toBeTruthy();

      // In 844x390 landscape, P1 station faces left end (90deg) and P2 station faces right end (-90deg)
      expect(station1.getAttribute('data-rotation')).toBe('90');
      expect(station2.getAttribute('data-rotation')).toBe('-90');

      // Left-thumb joysticks and right-thumb action/shift buttons exist for both P1 and P2
      const joy1 = container.querySelector('[data-testid="mobile-joystick-p1"]') as HTMLElement;
      const joy2 = container.querySelector('[data-testid="mobile-joystick-p2"]') as HTMLElement;
      const shift1 = container.querySelector('[data-testid="mobile-btn-shift-p1"]') as HTMLButtonElement;
      const shift2 = container.querySelector('[data-testid="mobile-btn-shift-p2"]') as HTMLButtonElement;
      const interact1 = container.querySelector('[data-testid="mobile-btn-interact-p1"]') as HTMLButtonElement;
      const use2 = container.querySelector('[data-testid="mobile-btn-use-p2"]') as HTMLButtonElement;

      expect(joy1).toBeTruthy();
      expect(joy2).toBeTruthy();
      expect(shift1).toBeTruthy();
      expect(shift2).toBeTruthy();
      expect(interact1).toBeTruthy();
      expect(use2).toBeTruthy();

      // Mock bounding client rects for both joysticks
      vi.spyOn(joy1, 'getBoundingClientRect').mockReturnValue({
        left: 50,
        top: 50,
        width: 100,
        height: 100,
        right: 150,
        bottom: 150,
        x: 50,
        y: 50,
        toJSON: () => ({}),
      });
      vi.spyOn(joy2, 'getBoundingClientRect').mockReturnValue({
        left: 700,
        top: 250,
        width: 100,
        height: 100,
        right: 800,
        bottom: 350,
        x: 700,
        y: 250,
        toJSON: () => ({}),
      });

      // Simultaneous multi-touch:
      // 1. P1 (at left end, 90deg) drags thumb away from left edge (+x screen: 100 -> 140) -> P1 Up!
      joy1.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 })
      );
      window.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 140, clientY: 100 })
      );
      expect(input.getPlayerInput(1).up).toBe(true);
      expect(input.getPlayerInput(2).up).toBe(false);

      // 2. P2 (at right end, -90deg) drags thumb away from right edge (-x screen: 750 -> 710) -> P2 Up!
      joy2.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 750, clientY: 300 })
      );
      window.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 710, clientY: 300 })
      );
      expect(input.getPlayerInput(2).up).toBe(true);

      // 3. Right-thumb actions and shifting for P1 and P2
      interact1.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      use2.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      shift2.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

      expect(input.getPlayerInput(1).interactSeq).toBe(1);
      expect(input.getPlayerInput(2).useItemSeq).toBe(1);
      expect(input.getPlayerInput(1).shiftRequestSeq).toBe(0);
      expect(input.getPlayerInput(2).shiftRequestSeq).toBe(1);

      shift1.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(input.getPlayerInput(1).shiftRequestSeq).toBe(1);
    });

    it('renders single-player Online Mode mobile controls with left-thumb joystick and right-thumb action/shift cluster', () => {
      input.setPlayMode('online', 2);
      mobile = new MobileControls({
        container,
        inputManager: input,
        forceEnabled: true,
        viewportSizeProvider: () => ({ width: 390, height: 844 }),
      });

      mobile.setSessionMode('online', 2, true);

      const joyOnline = container.querySelector('[data-testid="mobile-joystick-online"]') as HTMLElement;
      const shiftOnline = container.querySelector('[data-testid="mobile-btn-shift-online"]') as HTMLButtonElement;
      const invOnline = container.querySelector('[data-testid="mobile-btn-inv-online"]') as HTMLButtonElement;

      expect(joyOnline).toBeTruthy();
      expect(shiftOnline).toBeTruthy();
      expect(invOnline).toBeTruthy();

      vi.spyOn(joyOnline, 'getBoundingClientRect').mockReturnValue({
        left: 20,
        top: 680,
        width: 100,
        height: 100,
        right: 120,
        bottom: 780,
        x: 20,
        y: 680,
        toJSON: () => ({}),
      });

      // Drag left-thumb joystick right and down
      joyOnline.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 70, clientY: 730 })
      );
      window.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 105, clientY: 765 })
      );

      expect(input.getPlayerInput(2)).toMatchObject({
        right: true,
        down: true,
        up: false,
        left: false,
      });

      // Tap Shift with right thumb -> increments P2 shiftRequestSeq only
      shiftOnline.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(input.getPlayerInput(2).shiftRequestSeq).toBe(1);
      expect(input.getPlayerInput(1).shiftRequestSeq).toBe(0);

      // Hold INV button for 1000ms -> drops item
      invOnline.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(1000);
      expect(input.getPlayerInput(2).inventoryDropSeq).toBe(1);
      invOnline.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      expect(input.getPlayerInput(2).inventoryCycleSeq).toBe(0);
    });

    it('adapts head-to-head station rotations on orientation resize (Portrait 0/180 <-> Landscape 90/-90) and syncs station canvases', () => {
      let vw = 390;
      let vh = 844;
      const drawImageSpies: Array<ReturnType<typeof vi.fn>> = [];

      mobile = new MobileControls({
        container,
        inputManager: input,
        forceEnabled: true,
        viewportSizeProvider: () => ({ width: vw, height: vh }),
        canvasFactory: (w, h) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const drawImage = vi.fn();
          drawImageSpies.push(drawImage);
          vi.spyOn(c, 'getContext').mockReturnValue({
            clearRect: vi.fn(),
            drawImage,
          } as unknown as CanvasRenderingContext2D);
          return c;
        },
      });

      mobile.setSessionMode('local', 1, true);

      const station1 = container.querySelector('[data-testid="mobile-station-p1"]') as HTMLElement;
      const station2 = container.querySelector('[data-testid="mobile-station-p2"]') as HTMLElement;
      expect(station1.getAttribute('data-rotation')).toBe('0');
      expect(station2.getAttribute('data-rotation')).toBe('180');

      // Rotate phone to Landscape (844x390)
      vw = 844;
      vh = 390;
      window.dispatchEvent(new Event('resize'));
      expect(station1.getAttribute('data-rotation')).toBe('90');
      expect(station2.getAttribute('data-rotation')).toBe('-90');

      // Sync from 1000x650 main canvas -> blits left (0,0,500,650) to P1 and right (500,0,500,650) to P2
      const mainCanvas = document.createElement('canvas');
      mainCanvas.width = 1000;
      mainCanvas.height = 650;
      mobile.syncFromMainCanvas(mainCanvas);

      expect(drawImageSpies.length).toBe(2);
      expect(drawImageSpies[0]).toHaveBeenCalledWith(mainCanvas, 0, 0, 500, 650, 0, 0, 500, 650);
      expect(drawImageSpies[1]).toHaveBeenCalledWith(mainCanvas, 500, 0, 500, 650, 0, 0, 500, 650);

      // Pause & Mute utility buttons
      const onPause = vi.fn();
      const onMute = vi.fn();
      input.onPauseToggle(onPause);
      input.onMuteToggle(onMute);

      const pauseBtn = container.querySelector('[data-testid="mobile-btn-pause"]') as HTMLButtonElement;
      const muteBtn = container.querySelector('[data-testid="mobile-btn-mute"]') as HTMLButtonElement;
      pauseBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      muteBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(onPause).toHaveBeenCalledTimes(1);
      expect(onMute).toHaveBeenCalledTimes(1);
    });

    it('renders mobile zoom utility buttons and triggers zoom adjustment callbacks', () => {
      let zoom = 1.0;
      const onZoomDelta = vi.fn((delta: number) => {
        zoom = Math.max(1.0, Math.min(4.0, zoom + delta));
        mobile.setZoomDisplay(zoom);
      });
      const onZoomCycle = vi.fn(() => {
        zoom = zoom >= 2.0 ? 1.0 : zoom + 0.5;
        mobile.setZoomDisplay(zoom);
      });

      mobile = new MobileControls({
        container,
        inputManager: input,
        forceEnabled: true,
        viewportSizeProvider: () => ({ width: 390, height: 844 }),
        onZoomDelta,
        onZoomCycle,
      });

      mobile.setSessionMode('online', 1, true);
      mobile.setZoomDisplay(1.0);

      const zoomInBtn = container.querySelector('[data-testid="mobile-btn-zoom-in"]') as HTMLButtonElement;
      const zoomOutBtn = container.querySelector('[data-testid="mobile-btn-zoom-out"]') as HTMLButtonElement;
      const zoomCycleBtn = container.querySelector('[data-testid="mobile-btn-zoom-cycle"]') as HTMLButtonElement;

      expect(zoomInBtn).toBeTruthy();
      expect(zoomOutBtn).toBeTruthy();
      expect(zoomCycleBtn).toBeTruthy();
      expect(zoomCycleBtn.textContent).toContain('1x');

      zoomInBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(onZoomDelta).toHaveBeenCalledWith(0.25);
      expect(zoomCycleBtn.textContent).toContain('1.25x');

      zoomOutBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(onZoomDelta).toHaveBeenCalledWith(-0.25);
      expect(zoomCycleBtn.textContent).toContain('1x');

      zoomCycleBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(onZoomCycle).toHaveBeenCalledTimes(1);
    });

    it('isolates multi-touch pointerIds, prevents second-finger joystick stealing, ignores pointerleave on INV hold, and resets UI on window blur', () => {
      mobile = new MobileControls({
        container,
        inputManager: input,
        forceEnabled: true,
        viewportSizeProvider: () => ({ width: 390, height: 844 }),
      });
      mobile.setSessionMode('local', 1, true);

      const joy1 = container.querySelector('[data-testid="mobile-joystick-p1"]') as HTMLElement;
      const joy2 = container.querySelector('[data-testid="mobile-joystick-p2"]') as HTMLElement;
      const inv1 = container.querySelector('[data-testid="mobile-btn-inv-p1"]') as HTMLButtonElement;

      vi.spyOn(joy1, 'getBoundingClientRect').mockReturnValue({
        left: 20,
        top: 700,
        width: 100,
        height: 100,
        right: 120,
        bottom: 800,
        x: 20,
        y: 700,
        toJSON: () => ({}),
      });
      vi.spyOn(joy2, 'getBoundingClientRect').mockReturnValue({
        left: 270,
        top: 40,
        width: 100,
        height: 100,
        right: 370,
        bottom: 140,
        x: 270,
        y: 40,
        toJSON: () => ({}),
      });

      const makePointerEvent = (
        type: string,
        pointerId: number,
        clientX = 0,
        clientY = 0
      ) => {
        const ev = new MouseEvent(type, { bubbles: true, clientX, clientY });
        Object.defineProperty(ev, 'pointerId', { value: pointerId });
        return ev;
      };

      // P1 holds joystick with pointerId 10 and moves Up (clientY: 750 -> 710)
      joy1.dispatchEvent(makePointerEvent('pointerdown', 10, 70, 750));
      window.dispatchEvent(makePointerEvent('pointermove', 10, 70, 710));
      expect(input.getPlayerInput(1).up).toBe(true);

      // Second stray finger (pointerId 99) touches joy1 and lifts -> must NOT steal or reset pointerId 10!
      joy1.dispatchEvent(makePointerEvent('pointerdown', 99, 70, 750));
      window.dispatchEvent(makePointerEvent('pointerup', 99, 70, 750));
      expect(input.getPlayerInput(1).up).toBe(true);
      expect(joy1.classList.contains('is-active')).toBe(true);

      // P2 (180deg top station) simultaneously drags joy2 with pointerId 20 (+y screen: 90 -> 130 is Up in P2's 180deg frame!)
      joy2.dispatchEvent(makePointerEvent('pointerdown', 20, 320, 90));
      window.dispatchEvent(makePointerEvent('pointermove', 20, 320, 130));
      expect(input.getPlayerInput(2).up).toBe(true);

      // P1 presses INV button (pointerId 11) and thumb slightly drifts triggering pointerleave before 1000ms
      inv1.dispatchEvent(makePointerEvent('pointerdown', 11));
      vi.advanceTimersByTime(300);
      inv1.dispatchEvent(makePointerEvent('pointerleave', 11));
      // Must NOT prematurely cycle on pointerleave while thumb is still held down!
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(0);

      // Reaching 1000ms while still held drops the item!
      vi.advanceTimersByTime(700);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(1);
      inv1.dispatchEvent(makePointerEvent('pointerup', 11));
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(0);

      // Window blur resets active joysticks and held button UI states
      inv1.dispatchEvent(makePointerEvent('pointerdown', 12));
      expect(inv1.classList.contains('is-pressed')).toBe(true);
      window.dispatchEvent(new Event('blur'));
      expect(joy1.classList.contains('is-active')).toBe(false);
      expect(joy2.classList.contains('is-active')).toBe(false);
      expect(inv1.classList.contains('is-pressed')).toBe(false);
    });

    it('auto-enables on first touch event in Auto mode and immediately blits cached mainCanvas to station canvases', () => {
      localStorage.clear();
      const drawImageSpies: Array<ReturnType<typeof vi.fn>> = [];
      mobile = new MobileControls({
        container,
        inputManager: input,
        forceEnabled: null,
        viewportSizeProvider: () => ({ width: 390, height: 844 }),
        canvasFactory: (w, h) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const drawImage = vi.fn();
          drawImageSpies.push(drawImage);
          vi.spyOn(c, 'getContext').mockReturnValue({
            clearRect: vi.fn(),
            drawImage,
          } as unknown as CanvasRenderingContext2D);
          return c;
        },
      });

      const mainCanvas = document.createElement('canvas');
      mainCanvas.width = 1000;
      mainCanvas.height = 650;

      // Session starts before touch is detected
      mobile.setSessionMode('local', 1, true);
      mobile.syncFromMainCanvas(mainCanvas);
      expect(mobile.isEnabled()).toBe(false);

      // User touches the screen -> auto-enables and immediately blits mainCanvas!
      window.dispatchEvent(new Event('touchstart'));
      expect(mobile.isEnabled()).toBe(true);
      expect(drawImageSpies.length).toBe(2);
      expect(drawImageSpies[0]).toHaveBeenCalledWith(mainCanvas, 0, 0, 500, 650, 0, 0, 500, 650);
      expect(drawImageSpies[1]).toHaveBeenCalledWith(mainCanvas, 500, 0, 500, 650, 0, 0, 500, 650);
    });

    it('keeps mobile controls hidden by default on PC and uses side-by-side (0 deg / 0 deg) rather than facing off even if forced on PC', () => {
      mobile = new MobileControls({
        container,
        inputManager: input,
        devicePlatform: 'pc',
        forceEnabled: null,
        viewportSizeProvider: () => ({ width: 1920, height: 1080 }),
      });

      mobile.setSessionMode('local', 1, true);
      expect(mobile.getDevicePlatform()).toBe('pc');
      expect(mobile.isEnabled()).toBe(false);
      expect(
        container
          .querySelector('.shift-mobile-controls')
          ?.classList.contains('is-hidden')
      ).toBe(true);

      // Even if a stray touchstart fires on a PC touchscreen laptop, Auto mode stays disabled on PC
      window.dispatchEvent(new Event('touchstart'));
      expect(mobile.isEnabled()).toBe(false);

      // If the user explicitly forces Touch Controls ON on a PC, Local Co-op must still be side-by-side (0 deg / 0 deg), never facing off!
      mobile.setForceEnabled(true);
      expect(mobile.isEnabled()).toBe(true);

      const station1 = container.querySelector(
        '[data-testid="mobile-station-p1"]'
      ) as HTMLElement;
      const station2 = container.querySelector(
        '[data-testid="mobile-station-p2"]'
      ) as HTMLElement;
      expect(station1).toBeTruthy();
      expect(station2).toBeTruthy();
      expect(station1.getAttribute('data-rotation')).toBe('0');
      expect(station2.getAttribute('data-rotation')).toBe('0');
      expect(station1.style.width).toBe('960px');
      expect(station1.style.height).toBe('1080px');
      expect(station2.style.width).toBe('960px');
      expect(station2.style.height).toBe('1080px');
    });
  });
});
