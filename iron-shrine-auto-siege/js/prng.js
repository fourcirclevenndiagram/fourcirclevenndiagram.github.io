export class PRNG {
  constructor(seed = Date.now()) {
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  next() {
    let t = this.state += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  chance(probability) { return this.next() < probability; }
  pick(items) { return items[Math.floor(this.next() * items.length)]; }
  sign() { return this.chance(.5) ? -1 : 1; }
}
