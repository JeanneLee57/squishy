/**
 * Web Audio API 사운드 엔진
 *
 * 오디오 파일 없이 코드로 소리를 합성한다.
 * 브라우저 정책상 AudioContext는 유저 제스처(클릭 등) 후에만 재생 가능
 * → 첫 클릭 시 자동 초기화
 */

class SoundEngine {
  private ctx: AudioContext | null = null

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  /** 노이즈 버퍼 생성 (화이트 노이즈) */
  private createNoise(duration: number): AudioBufferSourceNode {
    const ctx = this.getCtx()
    const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    return src
  }

  /**
   * 뿌직 — 누를 때
   * 짧은 노이즈 버스트를 로우패스 필터로 걸러서 부드러운 "펑" 소리
   */
  playPoof() {
    const ctx = this.getCtx()
    const t = ctx.currentTime
    const duration = 0.12

    const noise = this.createNoise(duration)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(600, t)
    filter.frequency.exponentialRampToValueAtTime(150, t + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.2, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start(t)
    noise.stop(t + duration)
  }

  /**
   * 통통 — 손 뗄 때
   * 사인파 피치 벤드 (높 → 낮): 탄성 복원 느낌
   */
  playBoing() {
    const ctx = this.getCtx()
    const t = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(320, t)
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.35)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)

    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.4)
  }

  /**
   * 빵! — 터질 때
   * 노이즈 밴드패스 스위프 (높 → 낮) + 저음 쿵 임팩트
   */
  playPop() {
    const ctx = this.getCtx()
    const t = ctx.currentTime

    // 노이즈 스위프
    const noise = this.createNoise(0.3)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(2500, t)
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.3)
    filter.Q.value = 2

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.35, t)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)

    noise.connect(filter).connect(noiseGain).connect(ctx.destination)
    noise.start(t)
    noise.stop(t + 0.3)

    // 저음 임팩트
    const thud = ctx.createOscillator()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(90, t)
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.15)

    const thudGain = ctx.createGain()
    thudGain.gain.setValueAtTime(0.25, t)
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)

    thud.connect(thudGain).connect(ctx.destination)
    thud.start(t)
    thud.stop(t + 0.15)
  }

  /**
   * 쉬쉬 — 증기 루프
   * 하이패스 노이즈 루프, volume으로 강도 조절
   */
  private steamNodes: {
    source: AudioBufferSourceNode
    gain: GainNode
  } | null = null

  startSteam() {
    if (this.steamNodes) return
    const ctx = this.getCtx()

    // 2초 루프 노이즈
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 4000

    const gain = ctx.createGain()
    gain.gain.value = 0

    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start()

    this.steamNodes = { source: src, gain }
  }

  setSteamVolume(v: number) {
    if (this.steamNodes) {
      this.steamNodes.gain.gain.linearRampToValueAtTime(
        Math.min(v, 0.08),
        this.getCtx().currentTime + 0.1
      )
    }
  }

  stopSteam() {
    if (this.steamNodes) {
      const ctx = this.getCtx()
      this.steamNodes.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3)
      const src = this.steamNodes.source
      setTimeout(() => { try { src.stop() } catch {} }, 400)
      this.steamNodes = null
    }
  }
}

export const soundEngine = new SoundEngine()
