/**
 * Audio utility functions for PCM conversion and AudioWorklet setup.
 * Deepgram requires: PCM 16bit signed LE, 16kHz mono
 */

const WORKLET_PROCESSOR_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._inputSampleRate = sampleRate;
    this._outputSampleRate = 16000;
    this._ratio = this._inputSampleRate / this._outputSampleRate;
    // Accumulate ~250ms of 16kHz samples = 4000 samples
    this._chunkSize = 4000;
    this._resampleRemainder = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const mono = input[0];

    // Downsample from input rate to 16kHz using linear interpolation
    for (let i = 0; i < mono.length; i++) {
      this._resampleRemainder += this._outputSampleRate;
      if (this._resampleRemainder >= this._inputSampleRate) {
        this._resampleRemainder -= this._inputSampleRate;
        const s = Math.max(-1, Math.min(1, mono[i]));
        this._buffer.push(s);
      }
    }

    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.splice(0, this._chunkSize);
      const pcm = float32ToInt16LE(chunk);
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

function float32ToInt16LE(floatSamples) {
  const int16 = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

registerProcessor("pcm-processor", PcmProcessor);
`;

let workletBlobUrl: string | null = null;

export function getWorkletBlobUrl(): string {
  if (!workletBlobUrl) {
    const blob = new Blob([WORKLET_PROCESSOR_CODE], {
      type: "application/javascript",
    });
    workletBlobUrl = URL.createObjectURL(blob);
  }
  return workletBlobUrl;
}
