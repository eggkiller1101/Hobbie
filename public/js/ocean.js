// Local procedural surf: no downloads, third-party requests or autoplay.
export class OceanSound {
  constructor(createContext = () => new (window.AudioContext || window.webkitAudioContext)()) {
    this.createContext = createContext;
    this.context = null;
    this.volume = 0.35;
    this.playing = false;
    this.suspendTimer = null;
    this.operation = 0;
  }

  initialize() {
    if (this.context) return;
    const context = this.createContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);

    // Independent stereo noise channels, coloured into soft surf and foam.
    const buffer = context.createBuffer(2, context.sampleRate * 16, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
        data[i] = brown * 4;
      }
      // Crossfade the loop seam rather than letting the noise jump abruptly.
      const seam = Math.floor(context.sampleRate * 0.2);
      for (let i = 0; i < seam; i++) {
        const mix = i / seam;
        data[data.length - seam + i] = data[data.length - seam + i] * (1 - mix) + data[i] * mix;
      }
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    noise.loopStart = 0.2; // Continue at the end of the crossfade after each loop.

    const rumble = context.createBiquadFilter();
    rumble.type = 'highpass';
    rumble.frequency.value = 90;
    noise.connect(rumble);

    // Two slow, differing swells keep the shore from sounding like a metronome.
    for (const [frequency, cutoff, base, depth] of [[0.085, 900, 0.55, 0.4], [0.119, 2400, 0.25, 0.2]]) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = 0.5;
      const swell = context.createGain();
      swell.gain.value = base;
      const lfo = context.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = frequency;
      const modulation = context.createGain();
      modulation.gain.value = depth;
      lfo.connect(modulation);
      modulation.connect(swell.gain);
      rumble.connect(filter);
      filter.connect(swell);
      swell.connect(this.master);
      lfo.start();
    }
    noise.start();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.context && this.playing) this.fadeTo(this.volume * 0.8);
  }

  fadeTo(value) {
    const now = this.context.currentTime;
    const gain = this.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(value, now + 0.3);
  }

  async setPlaying(enabled) {
    const operation = ++this.operation;
    clearTimeout(this.suspendTimer);
    if (enabled) {
      this.initialize();
      try {
        await this.context.resume();
        if (operation !== this.operation) return;
        if (this.context.state !== 'running') throw new Error('Audio is unavailable');
        this.playing = true;
        this.fadeTo(this.volume * 0.8);
      } catch (error) {
        this.playing = false;
        this.master.gain.value = 0;
        throw error;
      }
    } else if (this.context) {
      this.playing = false;
      this.fadeTo(0);
      this.suspendTimer = setTimeout(() => {
        if (!this.playing) this.context.suspend().catch(() => {});
      }, 350);
    }
  }
}

export function setupOceanControls() {
  const toggle = document.querySelector('#ocean-toggle');
  const slider = document.querySelector('#ocean-volume');
  const status = document.querySelector('#ocean-status');
  const ocean = new OceanSound();
  try {
    const saved = localStorage.getItem('hobbie.oceanVolume');
    if (saved !== null && Number.isFinite(Number(saved))) ocean.setVolume(Number(saved));
  } catch { /* Storage can be unavailable in private/restricted contexts. */ }
  slider.value = Math.round(ocean.volume * 100);
  slider.setAttribute('aria-valuetext', `${slider.value}%`);

  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    status.textContent = '';
    try {
      await ocean.setPlaying(!ocean.playing);
      toggle.setAttribute('aria-pressed', String(ocean.playing));
      toggle.querySelector('.ocean-state').textContent = ocean.playing ? 'On' : 'Off';
    } catch {
      toggle.setAttribute('aria-pressed', 'false');
      toggle.querySelector('.ocean-state').textContent = 'Off';
      status.textContent = "Couldn't play the waves. Please try again.";
    } finally {
      toggle.disabled = false;
    }
  });

  slider.addEventListener('input', () => {
    ocean.setVolume(Number(slider.value) / 100);
    slider.setAttribute('aria-valuetext', `${slider.value}%`);
    try { localStorage.setItem('hobbie.oceanVolume', String(ocean.volume)); } catch {}
  });

  return {
    async stop() {
      await ocean.setPlaying(false);
      toggle.setAttribute('aria-pressed', 'false');
      toggle.querySelector('.ocean-state').textContent = 'Off';
    },
  };
}
