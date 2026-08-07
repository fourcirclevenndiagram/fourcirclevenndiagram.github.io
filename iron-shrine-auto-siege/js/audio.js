export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    this.muted = false;
    this.lastShot = 0;
    this.ambientNodes = [];
  }

  async unlock() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.16;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.unlocked = this.ctx.state === "running";
    if (this.unlocked) this.play("boot");
    return this.unlocked;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.16, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  tone(freq, duration, type = "square", volume = .24, slide = 1, delay = 0) {
    if (!this.unlocked || this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, freq * slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(.012, duration * .2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + .02);
  }

  noise(duration = .08, volume = .12, delay = 0) {
    if (!this.unlocked || this.muted || !this.ctx) return;
    const length = Math.ceil(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    src.start(this.ctx.currentTime + delay);
  }

  play(name) {
    if (!this.unlocked || this.muted) return;
    const now = performance.now();
    switch (name) {
      case "boot":
        this.tone(110, .09, "square", .16, 1.5);
        this.tone(165, .12, "square", .12, 1.5, .1);
        break;
      case "shot":
        if (now - this.lastShot < 48) return;
        this.lastShot = now;
        this.tone(230, .045, "square", .07, .55);
        break;
      case "hit":
        this.noise(.055, .065);
        break;
      case "capture":
        [220, 330, 440].forEach((f, i) => this.tone(f, .12, "square", .12, 1.02, i * .07));
        break;
      case "protocol":
        this.tone(155, .08, "square", .13, 2);
        this.tone(310, .08, "triangle", .1, .8, .06);
        break;
      case "boss":
        this.tone(72, .6, "sawtooth", .2, .52);
        this.noise(.42, .1);
        break;
      case "hurt":
        this.tone(95, .15, "sawtooth", .16, .45);
        break;
      case "win":
        [196, 247, 294, 392].forEach((f, i) => this.tone(f, .28, "square", .14, 1.01, i * .12));
        break;
      case "lose":
        [196, 147, 98].forEach((f, i) => this.tone(f, .32, "sawtooth", .15, .7, i * .13));
        break;
      case "tap":
        this.tone(520, .035, "square", .07, .8);
        break;
    }
  }

  startAmbient() {
    if (!this.ctx || !this.master) return;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = .025;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 190;
    [43.65, 65.41].forEach((frequency, index) => {
      const osc = this.ctx.createOscillator();
      osc.type = index ? "triangle" : "sawtooth";
      osc.frequency.value = frequency;
      osc.detune.value = index ? 7 : -5;
      osc.connect(filter);
      osc.start();
      this.ambientNodes.push(osc);
    });
    filter.connect(droneGain).connect(this.master);
    this.ambientNodes.push(filter, droneGain);
  }
}
