// 按键即发声：谱面上插入或改一个音之后短促地响一下，录入时凭耳朵就能核对。
//
// 与试听（`editor/player.ts`）同一个离线钢琴音色（`redist/soundfont/acoustic_grand_piano-mp3.js`），但各开各的 AudioContext：
// 试听那边每次起播都重建、停了就关，这里要常驻才能随按随响。音源第一次按键时才加载，加载失败就静默不响。

import { Soundfont } from "smplr";
import type { Accidental } from "../../model/doc";
import { jpPitch } from "../../score/jppitch";
import { asset } from "../../common/asset";

const PIANO_SOUNDFONT = "redist/soundfont/acoustic_grand_piano-mp3.js";
const STEP_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC_SEMI: Partial<Record<Accidental, number>> = { sharp: 1, flat: -1, "double-sharp": 2, "double-flat": -2 };

/** 唱名 + 八度点 + 面上的升降号 → MIDI 音高（升降号按「相对调号」近似：升一律 +1、降一律 -1）。 */
export function midiOf(degree: number, octave: number, acc: Accidental | null, fifths: number): number {
  const p = jpPitch(degree, octave, fifths);
  return 12 * (p.octave + 1) + STEP_SEMI[p.step]! + p.alter + (acc ? ACC_SEMI[acc] ?? 0 : 0);
}

export class NotePreview {
  private ctx: AudioContext | null = null;
  private inst: ReturnType<typeof Soundfont> | null = null;
  private failed = false;

  async play(midi: number): Promise<void> {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.inst = Soundfont(this.ctx, { instrumentUrl: asset(PIANO_SOUNDFONT) });
      }
      await this.ctx.resume();
      await this.inst!.ready;
      this.inst!.start({ note: midi, time: this.ctx.currentTime, duration: 0.3, velocity: 90 });
    } catch (e) {
      console.warn("按鍵發聲不可用", e);
      this.failed = true;
    }
  }

  dispose(): void {
    this.inst?.stop();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.inst = null;
  }
}
