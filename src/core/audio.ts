export type SfxName = 'ui' | 'dash' | 'kill' | 'hit' | 'spawn' | 'lose' | 'win' | 'start' | 'tick';

const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const STEP_TIME = 60 / 126 / 4; // 16th note at 126 BPM

/** Fully synthesised audio — the build ships zero audio files. */
export class AudioEngine {
  muted = false;

  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private intensity = 0;
  private running = false;

  init(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;

    const ac = new Ctor();
    const master = ac.createGain();
    master.gain.value = this.muted ? 0 : 0.85;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;

    const musicBus = ac.createGain();
    musicBus.gain.value = 0.5;
    const sfxBus = ac.createGain();
    sfxBus.gain.value = 0.85;

    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(comp);
    comp.connect(ac.destination);

    const len = Math.floor(ac.sampleRate * 0.5);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.ac = ac;
    this.master = master;
    this.musicBus = musicBus;
    this.sfxBus = sfxBus;
    this.noise = buf;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ac || !this.master) return;
    const t = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.02);
  }

  // ---------------------------------------------------------------- primitives

  private tone(
    when: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    glideTo?: number,
    bus: GainNode | null = this.sfxBus,
  ): void {
    if (!this.ac || !bus) return;
    const ac = this.ac;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), when + dur);
    }
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private noiseHit(
    when: number,
    dur: number,
    gain: number,
    filterType: BiquadFilterType,
    freq: number,
    q = 1,
    bus: GainNode | null = this.sfxBus,
  ): void {
    if (!this.ac || !this.noise || !bus) return;
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  private kick(when: number): void {
    this.tone(when, 130, 0.26, 'sine', 0.8, 44, this.musicBus);
  }

  private hat(when: number, gain: number): void {
    this.noiseHit(when, 0.035, gain, 'highpass', 7000, 0.7, this.musicBus);
  }

  private bass(when: number, note: number, gain: number): void {
    if (!this.ac || !this.musicBus) return;
    const ac = this.ac;
    const osc = ac.createOscillator();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = midi(note);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(320, when);
    f.frequency.exponentialRampToValueAtTime(160, when + 0.2);
    f.Q.value = 6;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.26);
  }

  private pad(when: number): void {
    const chord = [57, 60, 64, 67];
    for (const n of chord) {
      this.tone(when, midi(n), 0.9, 'triangle', 0.035, undefined, this.musicBus);
    }
  }

  private lead(when: number, note: number): void {
    this.tone(when, midi(note), 0.16, 'square', 0.055, undefined, this.musicBus);
  }

  // ---------------------------------------------------------------- music

  private scheduler = (): void => {
    if (!this.ac || !this.running) return;
    const horizon = this.ac.currentTime + 0.2;
    while (this.nextTime < horizon) {
      this.scheduleStep(this.nextTime);
      this.nextTime += STEP_TIME;
    }
  };

  private scheduleStep(t: number): void {
    const s = this.step;
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2) this.hat(t, 0.12);
    if (s % 8 === 7) this.hat(t, 0.2);

    const pattern = [33, 0, 33, 0, 36, 0, 30, 0, 33, 0, 38, 0, 36, 0, 33, 0];
    const b = pattern[s];
    if (b > 0) this.bass(t, b, s % 4 === 0 ? 0.16 : 0.1);

    if (this.intensity >= 1 && s === 0) this.pad(t);
    if (this.intensity >= 2 && s % 4 === 0) {
      const leadNotes = [69, 72, 74, 76, 79];
      this.lead(t, leadNotes[(s / 4) % leadNotes.length]);
    }
    this.step = (s + 1) % 16;
  }

  startMusic(): void {
    this.init();
    if (!this.ac || this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = this.ac.currentTime + 0.08;
    this.timer = window.setInterval(this.scheduler, 25);
    this.scheduler();
  }

  setIntensity(level: number): void {
    this.intensity = level;
  }

  stopMusic(): void {
    this.running = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ---------------------------------------------------------------- effects

  play(name: SfxName): void {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    switch (name) {
      case 'ui':
        this.tone(t, 720, 0.06, 'sine', 0.14, 640);
        break;
      case 'dash':
        this.tone(t, 180, 0.16, 'sawtooth', 0.09, 720);
        this.noiseHit(t, 0.14, 0.1, 'bandpass', 1400, 1.2);
        break;
      case 'kill':
        this.tone(t, 660, 0.13, 'triangle', 0.16, 180);
        this.noiseHit(t, 0.07, 0.09, 'highpass', 2600, 0.8);
        break;
      case 'hit':
        this.noiseHit(t, 0.14, 0.3, 'lowpass', 900, 1);
        this.tone(t, 110, 0.14, 'square', 0.12, 60);
        break;
      case 'spawn':
        this.tone(t, 300, 0.07, 'sine', 0.05, 420);
        break;
      case 'tick':
        this.tone(t, 880, 0.04, 'sine', 0.06);
        break;
      case 'start':
        this.tone(t, midi(57), 0.12, 'triangle', 0.14);
        this.tone(t + 0.1, midi(64), 0.16, 'triangle', 0.14);
        break;
      case 'lose':
        this.tone(t, midi(57), 0.3, 'sawtooth', 0.12, midi(45));
        this.tone(t + 0.12, midi(50), 0.4, 'triangle', 0.1, midi(38));
        break;
      case 'win':
        [57, 61, 64, 69].forEach((n, i) => {
          this.tone(t + i * 0.09, midi(n + 12), 0.22, 'triangle', 0.13);
        });
        break;
    }
  }
}
