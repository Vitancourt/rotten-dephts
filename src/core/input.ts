export class Input {
  private keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private attack = false;
  private guard = false;
  private pressed = new Set<string>();
  menuOpen = false;
  /** Called whenever the pointer is released (Esc, alt-tab): the pause menu should show. */
  onUnlock: (() => void) | null = null;

  constructor(private canvas: HTMLElement, private overlay: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.attack = true;
      if (e.button === 2) this.guard = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.attack = false;
      if (e.button === 2) this.guard = false;
    });
    // Right click is a game control while playing, not a context menu.
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      this.syncOverlay();
      if (!this.locked) {
        this.keys.clear();
        this.attack = false;
        this.guard = false;
        if (!this.menuOpen) this.onUnlock?.();
      }
    });
  }

  /** Capture the mouse and start playing. Must be called from a click or key press. */
  lock(): void {
    try {
      void (this.canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    } catch { /* the menu stays up; the player can click again */ }
  }

  /** Hide the pause overlay while locked or while a menu is open. */
  syncOverlay(): void {
    this.overlay.classList.toggle('hidden', this.locked || this.menuOpen);
  }

  /** Forget queued key presses (e.g. keys hit while a menu was open). */
  clearPresses(): void {
    this.pressed.clear();
  }

  /** True once per key press. */
  consumePress(code: string): boolean {
    return this.pressed.delete(code);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** True while right mouse is held. */
  get blocking(): boolean {
    return this.guard;
  }

  /** True while left mouse is held. */
  get attacking(): boolean {
    return this.attack;
  }

  /** Mouse delta since last call. */
  consumeLook(): { x: number; y: number } {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }
}
