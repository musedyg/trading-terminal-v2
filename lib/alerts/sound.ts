/**
 * 预警提示音：WebAudio 合成三声 beep，无需外部音频文件。
 * AudioContext 需要用户手势后才能发声，失败时静默跳过。
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 播放三声短促提示音（880Hz → 660Hz → 880Hz） */
export function playAlertSound(): void {
  const ac = getContext();
  if (!ac) return;
  try {
    const now = ac.currentTime;
    const freqs = [880, 660, 880];
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t0 = now + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    });
  } catch {
    // 发声失败不影响预警流程
  }
}
