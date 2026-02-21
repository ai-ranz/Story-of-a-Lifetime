/**
 * Procedural audio manager using Web Audio API.
 * Generates retro-style SFX and ambient tones — zero external assets.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private muted = false;

  private static instance: AudioManager;

  static getInstance(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  /** Must be called from a user gesture (click/tap) to unlock audio. */
  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
  }

  /** Resume AudioContext if suspended (required on mobile after user gesture). */
  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 0.3;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ═══════════════════════════════════════
  //  SFX
  // ═══════════════════════════════════════

  /** Short footstep tick. */
  playFootstep(): void {
    this.playTone(200 + Math.random() * 60, 'square', 0.04, 0.06);
  }

  /** Attack hit — descending noise burst. */
  playAttackHit(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Critical hit — louder version with higher pitch. */
  playCriticalHit(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Heal sparkle — ascending arpeggio. */
  playHeal(): void {
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      this.playTone(freq, 'sine', 0.15, 0.12, i * 0.08);
    });
  }

  /** Item pickup — bright two-note blip. */
  playItemPickup(): void {
    this.playTone(880, 'square', 0.1, 0.06, 0);
    this.playTone(1320, 'square', 0.1, 0.06, 0.06);
  }

  /** Chest open — descending then ascending. */
  playChestOpen(): void {
    this.playTone(440, 'triangle', 0.12, 0.08, 0);
    this.playTone(330, 'triangle', 0.12, 0.08, 0.08);
    this.playTone(660, 'triangle', 0.15, 0.12, 0.18);
  }

  /** Level up / skill learned — triumphant ascending arpeggio. */
  playLevelUp(): void {
    const notes = [523, 659, 784, 1047]; // C5-C6
    notes.forEach((freq, i) => {
      this.playTone(freq, 'square', 0.18, 0.15, i * 0.1);
    });
  }

  /** Victory fanfare. */
  playVictory(): void {
    const notes = [392, 494, 587, 784]; // G4-G5
    notes.forEach((freq, i) => {
      this.playTone(freq, 'square', 0.2, 0.18, i * 0.12);
    });
  }

  /** Defeat — descending sad tones. */
  playDefeat(): void {
    const notes = [392, 330, 262, 196]; // G4 down to G3
    notes.forEach((freq, i) => {
      this.playTone(freq, 'triangle', 0.25, 0.2, i * 0.15);
    });
  }

  /** Miss / flee fail — short low buzz. */
  playMiss(): void {
    this.playTone(120, 'square', 0.08, 0.1);
  }

  /** Flee success — whoosh. */
  playFlee(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** Menu select / dialog advance. */
  playSelect(): void {
    this.playTone(660, 'square', 0.06, 0.04);
  }

  /** Combat encounter start — alarm tone. */
  playCombatStart(): void {
    this.playTone(440, 'square', 0.08, 0.06, 0);
    this.playTone(550, 'square', 0.08, 0.06, 0.08);
    this.playTone(440, 'square', 0.08, 0.06, 0.16);
  }

  // ═══════════════════════════════════════
  //  AMBIENT
  // ═══════════════════════════════════════

  /** Start a gentle ambient drone. Different theme per area. */
  startAmbient(area: 'village' | 'forest' | 'cave' | 'boss'): void {
    this.stopAmbient();
    if (!this.ctx || !this.masterGain) return;

    const freqMap = { village: 220, forest: 165, cave: 110, boss: 147 };
    const freq = freqMap[area] ?? 165;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientGain.connect(this.masterGain);

    this.ambientOsc = this.ctx.createOscillator();
    this.ambientOsc.type = 'sine';
    this.ambientOsc.frequency.value = freq;
    this.ambientOsc.connect(this.ambientGain);
    this.ambientOsc.start();

    // Fade in
    this.ambientGain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 1.0);
  }

  stopAmbient(): void {
    if (this.ambientOsc) {
      try { this.ambientOsc.stop(); } catch { /* already stopped */ }
      this.ambientOsc.disconnect();
      this.ambientOsc = null;
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
  }

  // ═══════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════

  private playTone(
    freq: number,
    type: OscillatorType,
    volume: number,
    duration: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }
}
