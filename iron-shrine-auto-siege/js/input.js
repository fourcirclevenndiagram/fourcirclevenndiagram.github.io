import { W, H } from "./constants.js";

export class InputController {
  constructor(canvas, shell, simulation, audio, onMetaChange = () => {}) {
    this.canvas = canvas;
    this.shell = shell;
    this.sim = simulation;
    this.audio = audio;
    this.onMetaChange = onMetaChange;
    this.boundPointer = event => this.onPointer(event);
    this.boundKey = event => this.onKey(event);
    shell.addEventListener("pointerdown", this.boundPointer, { passive: false });
    window.addEventListener("keydown", this.boundKey);
  }

  async onPointer(event) {
    event.preventDefault();
    await this.audio.unlock();
    this.onMetaChange();
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * W;
    const y = (event.clientY - rect.top) / rect.height * H;

    if (this.sim.duel || this.sim.protocol || this.sim.unitBrief) return;

    if (y < 42) {
      if (x >= 181) {
        this.audio.toggleMute();
        this.audio.play("tap");
      } else if (x >= 140) {
        this.sim.cycleSpeed();
      }
      this.onMetaChange();
      return;
    }

    if (y >= 405) {
      if (x >= 4 && x < 73) this.sim.setDoctrine("seek", true);
      else if (x >= 73 && x < 143) this.sim.setDoctrine("bastion", true);
      else if (x >= 143 && x <= 212) this.sim.setDoctrine("reaper", true);
      this.onMetaChange();
    }
  }

  onKey(event) {
    if (event.key === "1") this.sim.setDoctrine("seek", true);
    else if (event.key === "2") this.sim.setDoctrine("bastion", true);
    else if (event.key === "3") this.sim.setDoctrine("reaper", true);
    else if (event.key.toLowerCase() === "s") this.sim.cycleSpeed();
    else if (event.key.toLowerCase() === "m") this.audio.toggleMute();
  }

  destroy() {
    this.shell.removeEventListener("pointerdown", this.boundPointer);
    window.removeEventListener("keydown", this.boundKey);
  }
}
