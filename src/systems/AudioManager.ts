/**
 * Procedural audio manager using Web Audio API.
 * Generates retro-style SFX and procedural medieval/classical music — zero external assets.
 */

// ═══════════════════════════════════════
//  Musical scales & note helpers
// ═══════════════════════════════════════

/** MIDI-style note to frequency. */
function noteToFreq(note: number): number { return 440 * Math.pow(2, (note - 69) / 12); }

// Note constants (MIDI numbers)
const C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55, A3 = 57, B3 = 59;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79, A5 = 81;

// Chord progressions (MIDI root notes + intervals for triads)
// Village: warm Renaissance/Baroque feel — I IV V vi in C major
const VILLAGE_CHORDS = [
  [C3, E3, G3], [F3, A3, C4], [G3, B3, D4], [A3, C4, E4],
  [F3, A3, C4], [D3, F3, A3], [G3, B3, D4], [C3, E3, G3],
];
// Forest: modal/Dorian feel — mysterious, medieval
const FOREST_CHORDS = [
  [D3, F3, A3], [C3, E3, G3], [D3, F3, A3], [A3, C4, E4],
  [G3, B3, D4], [F3, A3, C4], [A3, C4, E4], [D3, F3, A3],
];
// Cave: minor, tense — Am Em Dm Am
const CAVE_CHORDS = [
  [A3, C4, E4], [E3, G3, B3], [D3, F3, A3], [A3, C4, E4],
  [D3, F3, A3], [E3, G3, B3], [A3, C4, E4], [E3, G3, B3],
];
// Boss: dramatic, driving
const BOSS_CHORDS = [
  [D3, F3, A3], [D3, F3, A3], [E3, G3, B3], [E3, G3, B3],
  [A3, C4, E4], [G3, B3, D4], [F3, A3, C4], [E3, G3, B3],
];

// Melodic patterns per area (scale degree offsets from chord root, in semitones above root)
// Village melodies: lilting, baroque ornamental patterns
const VILLAGE_MELODY_PATTERNS = [
  [0, 4, 7, 12, 7, 4],       // ascending triad + octave, descending
  [12, 11, 9, 7, 4, 0],      // stepwise descent from octave
  [0, 2, 4, 7, 9, 7, 4, 2],  // scalewise up-down
  [7, 5, 4, 2, 0, 2, 4, 7],  // arch down-up through scale
  [0, 7, 4, 12, 9, 7],       // leaping triad pattern
  [4, 7, 9, 12, 9, 7, 4, 0], // ascending/descending through 3rd
];
// Forest: pentatonic, wistful
const FOREST_MELODY_PATTERNS = [
  [0, 3, 7, 10, 12, 10, 7],
  [12, 10, 7, 3, 0, 3, 7],
  [0, 5, 7, 12, 7, 5, 0],
  [7, 5, 3, 0, 3, 5, 7, 12],
];
// Cave: sparse, chromatic tension
const CAVE_MELODY_PATTERNS = [
  [0, 3, 7, 8, 7, 3],
  [12, 11, 7, 3, 0],
  [0, 1, 3, 7, 3, 1, 0],
  [7, 8, 7, 3, 0, 3],
];
// Boss: aggressive, driving
const BOSS_MELODY_PATTERNS = [
  [0, 3, 7, 10, 12, 10, 7, 3],
  [12, 10, 7, 3, 0, 0, 3, 7],
  [0, 7, 0, 7, 12, 7, 0],
];

type AreaMusic = 'village' | 'forest' | 'cave' | 'boss';

interface AreaConfig {
  chords: number[][];
  melodyPatterns: number[][];
  tempo: number;        // beats per second
  melodyOctave: number; // octave offset for melody (12 = +1 octave)
  luteVol: number;
  melodyVol: number;
  bassVol: number;
  melodyWave: OscillatorType;
  swing: number;        // 0-1, swing factor for timing
}

const AREA_CONFIGS: Record<AreaMusic, AreaConfig> = {
  village: {
    chords: VILLAGE_CHORDS, melodyPatterns: VILLAGE_MELODY_PATTERNS,
    tempo: 2.4, melodyOctave: 12, luteVol: 0.06, melodyVol: 0.045, bassVol: 0.03,
    melodyWave: 'triangle', swing: 0.15,
  },
  forest: {
    chords: FOREST_CHORDS, melodyPatterns: FOREST_MELODY_PATTERNS,
    tempo: 1.8, melodyOctave: 12, luteVol: 0.04, melodyVol: 0.04, bassVol: 0.025,
    melodyWave: 'sine', swing: 0.1,
  },
  cave: {
    chords: CAVE_CHORDS, melodyPatterns: CAVE_MELODY_PATTERNS,
    tempo: 1.5, melodyOctave: 12, luteVol: 0.035, melodyVol: 0.035, bassVol: 0.025,
    melodyWave: 'sine', swing: 0.05,
  },
  boss: {
    chords: BOSS_CHORDS, melodyPatterns: BOSS_MELODY_PATTERNS,
    tempo: 3.2, melodyOctave: 12, luteVol: 0.05, melodyVol: 0.05, bassVol: 0.04,
    melodyWave: 'sawtooth', swing: 0.0,
  },
};

const MUTE_KEY = 'soal_muted';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private muted = false;
  private currentArea: AreaMusic | null = null;
  private musicTimer: number | null = null; // setInterval id
  private chordIndex = 0;
  private beatInChord = 0;
  private melodyPattern: number[] = [];
  private melodyIndex = 0;

  private static instance: AudioManager;

  static getInstance(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  get isMuted(): boolean { return this.muted; }

  /** Must be called from a user gesture (click/tap) to unlock audio. */
  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);

    // Separate gain nodes for music vs SFX
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 1.0;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1.0;
    this.sfxGain.connect(this.masterGain);

    // Restore mute preference
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* no storage */ }
    if (this.muted && this.masterGain) this.masterGain.gain.value = 0;
  }

  /** Resume AudioContext if suspended (required on mobile after user gesture). */
  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 0.3;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* no storage */ }
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
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Critical hit — louder version with higher pitch. */
  playCriticalHit(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.sfxGain);
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
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(this.sfxGain);
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
  //  PROCEDURAL MUSIC — Medieval/Classical
  // ═══════════════════════════════════════

  /** Start procedural music for an area. Plays lute arpeggios, melody, and bass continuously. */
  startAmbient(area: AreaMusic): void {
    if (area === this.currentArea) return;
    this.stopAmbient();
    if (!this.ctx || !this.musicGain) return;

    this.currentArea = area;
    const cfg = AREA_CONFIGS[area];
    this.chordIndex = 0;
    this.beatInChord = 0;
    this.melodyPattern = cfg.melodyPatterns[Math.floor(Math.random() * cfg.melodyPatterns.length)];
    this.melodyIndex = 0;

    const beatMs = Math.round(1000 / cfg.tempo);
    this.scheduleBeat(cfg);
    this.musicTimer = window.setInterval(() => this.scheduleBeat(cfg), beatMs);
  }

  private scheduleBeat(cfg: AreaConfig): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const beatDur = 1 / cfg.tempo;
    const chord = cfg.chords[this.chordIndex % cfg.chords.length];

    // ── Lute arpeggio (plucked string sound) ──
    // On each beat, play one note of the current chord as a plucked string
    const arpeggioNote = chord[this.beatInChord % chord.length] + 12; // +1 octave
    const swingOffset = (this.beatInChord % 2 === 1) ? beatDur * cfg.swing : 0;
    this.playPluckedString(noteToFreq(arpeggioNote), cfg.luteVol, beatDur * 0.8, t + swingOffset);

    // ── Melody (every other beat, plays the next note in the pattern) ──
    if (this.beatInChord % 2 === 0) {
      const melNote = chord[0] + cfg.melodyOctave + this.melodyPattern[this.melodyIndex % this.melodyPattern.length];
      this.playMelodyNote(noteToFreq(melNote), cfg.melodyVol, beatDur * 1.5, t, cfg.melodyWave);
      this.melodyIndex++;
      // Pick a new pattern occasionally for variation
      if (this.melodyIndex >= this.melodyPattern.length) {
        this.melodyPattern = cfg.melodyPatterns[Math.floor(Math.random() * cfg.melodyPatterns.length)];
        this.melodyIndex = 0;
      }
    }

    // ── Bass drone (on beat 0 of each chord) ──
    if (this.beatInChord === 0) {
      const bassNote = chord[0] - 12; // -1 octave
      this.playBassNote(noteToFreq(bassNote), cfg.bassVol, beatDur * chord.length * 0.9, t);
    }

    // Advance beat
    this.beatInChord++;
    if (this.beatInChord >= chord.length * 2) {
      this.beatInChord = 0;
      this.chordIndex++;
      if (this.chordIndex >= cfg.chords.length) this.chordIndex = 0;
    }
  }

  /** Plucked lute/harp string — fast attack, medium decay with harmonics. */
  private playPluckedString(freq: number, vol: number, dur: number, startTime: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t = startTime;

    // Fundamental
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    // 2nd harmonic (octave) for brightness
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;

    // 3rd harmonic (fifth above octave) — subtle
    const osc3 = this.ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = freq * 3;

    const gain = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    const gain3 = this.ctx.createGain();

    // Pluck envelope: instant attack, exponential decay
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(vol * 0.3, t + dur * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    gain2.gain.setValueAtTime(vol * 0.3, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);

    gain3.gain.setValueAtTime(vol * 0.1, t);
    gain3.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.3);

    osc1.connect(gain).connect(this.musicGain);
    osc2.connect(gain2).connect(this.musicGain);
    osc3.connect(gain3).connect(this.musicGain);

    osc1.start(t); osc1.stop(t + dur + 0.01);
    osc2.start(t); osc2.stop(t + dur * 0.5 + 0.01);
    osc3.start(t); osc3.stop(t + dur * 0.3 + 0.01);
  }

  /** Melody note — sustained with gentle vibrato, like a recorder or flute. */
  private playMelodyNote(freq: number, vol: number, dur: number, startTime: number, wave: OscillatorType): void {
    if (!this.ctx || !this.musicGain) return;
    const t = startTime;

    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;

    // Gentle vibrato
    const vibrato = this.ctx.createOscillator();
    const vibratoGain = this.ctx.createGain();
    vibrato.type = 'sine';
    vibrato.frequency.value = 4.5; // vibrato rate
    vibratoGain.gain.value = freq * 0.008; // subtle pitch variation
    vibrato.connect(vibratoGain).connect(osc.frequency);

    const gain = this.ctx.createGain();
    // Soft attack, sustain, soft release
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + dur * 0.1);
    gain.gain.setValueAtTime(vol, t + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain).connect(this.musicGain);

    vibrato.start(t); vibrato.stop(t + dur + 0.01);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  /** Bass note — warm, low, sustained. */
  private playBassNote(freq: number, vol: number, dur: number, startTime: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t = startTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq;

    const gain = this.ctx.createGain();
    const gain2 = this.ctx.createGain();

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.05);
    gain.gain.setValueAtTime(vol, t + dur * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.linearRampToValueAtTime(vol * 0.4, t + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);

    osc.connect(gain).connect(this.musicGain);
    osc2.connect(gain2).connect(this.musicGain);

    osc.start(t); osc.stop(t + dur + 0.01);
    osc2.start(t); osc2.stop(t + dur * 0.6 + 0.01);
  }

  stopAmbient(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.currentArea = null;
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
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }
}
