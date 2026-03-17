"use client";

import { useCallback, useRef, useState } from "react";
import { getWorkletBlobUrl } from "./audio-utils";

interface UseAudioRecorderOptions {
  /** Called with PCM 16bit LE chunk (16kHz mono, ~250ms) */
  onAudioChunk: (chunk: ArrayBuffer) => void;
}

interface UseAudioRecorderReturn {
  start: () => Promise<void>;
  stop: () => void;
  isRecording: boolean;
}

export function useAudioRecorder({
  onAudioChunk,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const onAudioChunkRef = useRef(onAudioChunk);
  onAudioChunkRef.current = onAudioChunk;

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      },
    });
    streamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 48000 });
    audioContextRef.current = audioContext;

    await audioContext.audioWorklet.addModule(getWorkletBlobUrl());

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      onAudioChunkRef.current(e.data);
    };

    source.connect(workletNode);
    workletNode.connect(audioContext.destination);

    setIsRecording(true);
  }, []);

  const stop = useCallback(() => {
    workletNodeRef.current?.disconnect();
    sourceRef.current?.disconnect();

    audioContextRef.current?.close();
    audioContextRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setIsRecording(false);
  }, []);

  return { start, stop, isRecording };
}
