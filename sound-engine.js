const SOUND_PREFERENCE_KEY = "forest-game-sound-enabled";

function savedPreference() {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function createSoundEngine({ lite = false } = {}) {
  let context = null;
  let master = null;
  let enabled = typeof window === "undefined" ? true : savedPreference();
  let chargeBus = null;
  let chargeHum = [];
  let chargeTimers = [];

  function ensure() {
    if (context) {
      if (context.state === "suspended") context.resume?.();
      return context;
    }
    if (typeof window === "undefined") return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    context = new AudioContext();
    master = context.createGain();
    const compressor = context.createDynamicsCompressor?.();
    master.gain.setValueAtTime(enabled ? 0.72 : 0.0001, context.currentTime);
    if (compressor) {
      compressor.threshold.setValueAtTime(-18, context.currentTime);
      compressor.knee.setValueAtTime(16, context.currentTime);
      compressor.ratio.setValueAtTime(5, context.currentTime);
      master.connect(compressor).connect(context.destination);
    } else {
      master.connect(context.destination);
    }
    context.resume?.();
    return context;
  }

  function tone({
    frequency,
    duration = 0.1,
    delay = 0,
    volume = 0.04,
    type = "sine",
    destination = master,
    endFrequency = frequency,
  }) {
    const audio = ensure();
    if (!audio || !enabled) return null;
    const output = destination || master;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const startAt = audio.currentTime + delay;
    const endAt = startAt + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), startAt);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), endAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + Math.min(0.018, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(gain).connect(output);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.025);
    return oscillator;
  }

  function noise({ duration = 0.2, delay = 0, volume = 0.025, frequency = 1400 } = {}) {
    const audio = ensure();
    if (!audio || !enabled) return null;
    const frameCount = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, frameCount, audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const fade = 1 - (index / channel.length);
      channel[index] = (Math.random() * 2 - 1) * fade;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const startAt = audio.currentTime + delay;
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, startAt);
    filter.Q.setValueAtTime(0.7, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(startAt);
    source.stop(startAt + duration + 0.02);
    return source;
  }

  function stopCharge() {
    chargeTimers.forEach((timer) => window.clearTimeout(timer));
    chargeTimers = [];
    if (!context) return;
    if (chargeBus) {
      const now = context.currentTime;
      chargeBus.gain.cancelScheduledValues(now);
      chargeBus.gain.setValueAtTime(Math.max(0.0001, chargeBus.gain.value), now);
      chargeBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    }
    chargeHum.forEach((source) => {
      try { source.stop(context.currentTime + 0.045); } catch { /* already stopped */ }
    });
    chargeHum = [];
    chargeBus = null;
  }

  function tap() {
    tone({ frequency: 520, endFrequency: 610, duration: 0.055, volume: 0.028, type: "sine" });
  }

  function startCharge() {
    const audio = ensure();
    if (!audio || !enabled) return;
    stopCharge();
    chargeBus = audio.createGain();
    chargeBus.gain.setValueAtTime(0.82, audio.currentTime);
    chargeBus.connect(master);

    tone({ frequency: 294, endFrequency: 392, duration: 0.12, volume: 0.04, type: "sine", destination: chargeBus });

    const lowHum = audio.createOscillator();
    const lowGain = audio.createGain();
    lowHum.type = "sine";
    lowHum.frequency.setValueAtTime(92, audio.currentTime);
    lowHum.frequency.exponentialRampToValueAtTime(184, audio.currentTime + 7.3);
    lowGain.gain.setValueAtTime(0.0001, audio.currentTime);
    lowGain.gain.exponentialRampToValueAtTime(lite ? 0.018 : 0.024, audio.currentTime + 0.4);
    lowGain.gain.linearRampToValueAtTime(lite ? 0.032 : 0.044, audio.currentTime + 7.3);
    lowHum.connect(lowGain).connect(chargeBus);
    lowHum.start();
    lowHum.stop(audio.currentTime + 9);

    const shimmer = audio.createOscillator();
    const shimmerGain = audio.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(368, audio.currentTime);
    shimmer.frequency.exponentialRampToValueAtTime(736, audio.currentTime + 7.3);
    shimmerGain.gain.setValueAtTime(0.0001, audio.currentTime);
    shimmerGain.gain.exponentialRampToValueAtTime(lite ? 0.004 : 0.008, audio.currentTime + 0.8);
    shimmerGain.gain.linearRampToValueAtTime(lite ? 0.012 : 0.018, audio.currentTime + 7.3);
    shimmer.connect(shimmerGain).connect(chargeBus);
    shimmer.start();
    shimmer.stop(audio.currentTime + 9);
    chargeHum = [lowHum, shimmer];

    const pulseTimes = lite
      ? [5.7, 6.5, 6.9, 7.15, 7.28]
      : [5.1, 5.7, 6.15, 6.5, 6.78, 7.0, 7.16, 7.28];
    const activeBus = chargeBus;
    pulseTimes.forEach((delay, index) => {
      const timer = window.setTimeout(() => {
        if (chargeBus !== activeBus || !enabled) return;
        const isFinalPulse = delay >= 7;
        tone({
          frequency: isFinalPulse ? 880 : 660,
          endFrequency: isFinalPulse ? 990 : 740,
          duration: 0.055,
          volume: lite ? 0.026 : 0.034,
          type: "sine",
          destination: activeBus,
        });
      }, delay * 1000);
      chargeTimers.push(timer);
    });
  }

  function release() {
    stopCharge();
    noise({ duration: 0.18, volume: 0.036, frequency: 1050 });
    tone({ frequency: 310, endFrequency: 470, duration: 0.16, volume: 0.055, type: "triangle" });
    tone({ frequency: 620, endFrequency: 820, duration: 0.13, delay: 0.07, volume: 0.04 });
  }

  function miss(direction) {
    const notes = direction === "early" ? [392, 349, 330] : [349, 294, 262];
    notes.forEach((frequency, index) => {
      tone({ frequency, duration: 0.12, delay: index * 0.11, volume: 0.038, type: "triangle" });
    });
    tone({ frequency: 494, endFrequency: 587, duration: 0.16, delay: 0.38, volume: 0.032 });
  }

  function victory() {
    stopCharge();
    noise({ duration: 0.42, volume: 0.04, frequency: 1900 });
    [523, 659, 784, 1046].forEach((frequency, index) => {
      tone({ frequency, duration: 0.24, delay: index * 0.105, volume: 0.065, type: "triangle" });
    });
    [1175, 1319, 1568].forEach((frequency, index) => {
      tone({ frequency, endFrequency: frequency * 1.08, duration: 0.11, delay: 0.46 + index * 0.08, volume: 0.038 });
    });
  }

  function reset() {
    stopCharge();
    tone({ frequency: 440, endFrequency: 660, duration: 0.13, volume: 0.035 });
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    const audio = ensure();
    if (audio && master) {
      const now = audio.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(enabled ? 0.72 : 0.0001, now, 0.015);
    }
    if (!enabled) stopCharge();
    try { window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(enabled)); } catch { /* storage unavailable */ }
    if (enabled) tap();
    return enabled;
  }

  return {
    isEnabled: () => enabled,
    tap,
    startCharge,
    stopCharge,
    release,
    miss,
    victory,
    reset,
    setEnabled,
    toggle: () => setEnabled(!enabled),
  };
}
