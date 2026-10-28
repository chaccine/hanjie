import { loadAudio, saveAudio } from "./storage.js";
import { clamp } from "./physics.js";

// 全局仅一个音频引擎；短音结束即断开，切换关卡时清理短音与电机。
export class WorkshopAudio {
  constructor() {
    this.settings = loadAudio();
    this.context = null;
    this.voices = new Set();
    this.lastContact = null;
    this.pulseCooldown = 0;
  }

  init() {
    if (this.context) {
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      const c = (this.context = new AudioContext());
      this.master = c.createGain();
      this.effects = c.createGain();
      this.ambience = c.createGain();
      this.master.connect(c.destination);
      this.effects.connect(this.master);
      this.ambience.connect(this.master);
      this.buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = this.buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.hiss = this.noiseLoop("bandpass", 1700, 0, this.effects);
      this.fan = this.noiseLoop("lowpass", 220, 0.045, this.ambience);
      // 低音量的工作室氛围和柔和泛音，可单独关闭。
      for (const frequency of [110, 164.81, 220.25]) {
        const oscillator = c.createOscillator();
        const gain = c.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.006;
        oscillator.connect(gain).connect(this.ambience);
        oscillator.start();
      }
      this.motor = c.createOscillator();
      this.motor.type = "triangle";
      this.motor.frequency.value = 68;
      this.motorGain = c.createGain();
      this.motorGain.gain.value = 0;
      this.motor.connect(this.motorGain).connect(this.effects);
      this.motor.start();
      this.apply();
    } catch {
      this.context?.close().catch(() => {});
      this.context = null;
    }
  }

  noiseLoop(type, frequency, volume, destination) {
    const c = this.context;
    const source = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    source.buffer = this.buffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(destination);
    source.start();
    return { source, filter, gain };
  }

  apply() {
    saveAudio(this.settings);
    if (!this.context) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.volume, t, 0.03);
    this.effects.gain.setTargetAtTime(this.settings.effects ? 1 : 0, t, 0.03);
    this.ambience.gain.setTargetAtTime(this.settings.music ? 1 : 0, t, 0.03);
  }

  // 软起音和非整数泛音模拟金属、铃声，避免方波的尖锐感。
  tone(frequency, duration, volume = 0.08, delay = 0) {
    if (!this.context || !this.settings.effects || this.voices.size > 40)
      return;
    const c = this.context;
    const start = c.currentTime + delay;
    const source = c.createOscillator();
    const gain = c.createGain();
    source.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain).connect(this.effects);
    this.track(source, [gain]);
    source.start(start);
    source.stop(start + duration + 0.01);
  }

  track(source, nodes) {
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
      this.voices.delete(voice);
    };
  }

  crackle(intensity) {
    if (!this.context || !this.settings.effects || this.voices.size > 40)
      return;
    const c = this.context;
    const source = c.createBufferSource();
    source.buffer = this.buffer;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1300 + Math.random() * 1800;
    const gain = c.createGain();
    const t = c.currentTime;
    gain.gain.setValueAtTime(0.018 * intensity, t);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      t + 0.025 + Math.random() * 0.035,
    );
    source.connect(filter).connect(gain).connect(this.effects);
    this.track(source, [filter, gain]);
    source.start(t, Math.random());
    source.stop(t + 0.08);
  }

  chime(perfect) {
    const base = perfect ? 880 : 260;
    [1, 2.01, 2.73, 4.13].forEach((ratio, i) =>
      this.tone(base * ratio, 0.8 / (1 + i * 0.5), 0.075 / (i + 1), i * 0.012),
    );
  }

  powerCue(stage, success) {
    if (stage === 1) this.tone(480, 0.14, 0.08);
    if (stage === 2) {
      this.tone(success ? 780 : 145, 0.22);
      this.tone(success ? 780 : 130, 0.18, 0.06, 0.3);
    }
    if (stage === 4) {
      (success ? [523, 659, 784] : [220, 185, 130]).forEach((f, i) =>
        this.tone(f, 0.55, 0.09, i * 0.14),
      );
    }
  }

  update(state, dt) {
    if (!this.context) return;
    const j = state.active;
    const heating =
      state.phase === "play" && (state.input.left || state.input.touchHeat);
    const feeding =
      state.input.right || state.input.space || state.input.touchFeed;
    const contact = heating && j && !j.settled ? j.id : null;
    if (contact !== null && contact !== this.lastContact) {
      this.tone(2300, 0.06, 0.025);
      this.tone(3710, 0.035, 0.009);
    }
    this.lastContact = contact;
    const intensity = contact !== null ? clamp((j.temp - 150) / 270, 0, 1) : 0;
    const t = this.context.currentTime;
    this.hiss.gain.gain.setTargetAtTime(
      intensity * (feeding ? 0.06 : 0.012),
      t,
      0.08,
    );
    this.hiss.filter.frequency.setTargetAtTime(
      800 + (j?.temp || 25) * 4,
      t,
      0.08,
    );
    this.pulseCooldown -= dt;
    if (this.pulseCooldown <= 0 && intensity > 0.3) {
      this.crackle(intensity * (feeding ? 2 : 0.6));
      this.pulseCooldown = 0.06 + Math.random() * 0.23;
    }
    const motorOn =
      state.phase === "power" && state.powerTime >= 3 && state.result.success;
    this.motorGain.gain.setTargetAtTime(motorOn ? 0.035 : 0, t, 0.15);
    this.motor.frequency.setTargetAtTime(
      motorOn ? 90 + Math.sin(state.sceneTime * 9) * 3 : 55,
      t,
      0.4,
    );
  }

  stop() {
    for (const { source } of this.voices) {
      try {
        source.stop();
      } catch {
        /* 已结束的短音无需处理。 */
      }
    }
    this.lastContact = null;
    if (!this.context) return;
    this.hiss.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    this.motorGain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
  }

  suspend() {
    this.stop();
    this.context?.suspend().catch(() => {});
  }
}
