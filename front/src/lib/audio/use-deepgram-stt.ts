"use client";

import { useCallback, useRef, useState } from "react";

export interface DeepgramTranscriptEvent {
  type: "partial" | "final";
  text: string;
  speakerLabel: number;
  confidence: number;
}

interface UseDeepgramSTTOptions {
  onTranscript: (event: DeepgramTranscriptEvent) => void;
  onError?: (error: Error) => void;
  keywords?: string[];
}

interface UseDeepgramSTTReturn {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (chunk: ArrayBuffer) => void;
  isConnected: boolean;
}

export function useDeepgramSTT({
  onTranscript,
  onError,
  keywords = [],
}: UseDeepgramSTTOptions): UseDeepgramSTTReturn {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const keywordsRef = useRef(keywords);
  keywordsRef.current = keywords;

  const audioBufferRef = useRef<ArrayBuffer[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushAudioBuffer = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || audioBufferRef.current.length === 0) return;

    const chunks = audioBufferRef.current;
    audioBufferRef.current = [];

    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    ws.send(merged.buffer);
  }, []);

  const parseResults = useCallback((data: DeepgramResult) => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt || !alt.transcript) return;

    const speakerLabel = getDominantSpeaker(alt.words);

    onTranscriptRef.current({
      type: data.is_final ? "final" : "partial",
      text: alt.transcript,
      speakerLabel,
      confidence: alt.confidence ?? 1.0,
    });
  }, []);

  const connect = useCallback(async () => {
    const res = await fetch("/api/stt");
    if (!res.ok) throw new Error("Deepgram API 키를 가져올 수 없습니다");
    const { key } = await res.json();

    const params = new URLSearchParams({
      model: "nova-2",
      language: "ko",
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
      diarize: "true",
      interim_results: "true",
      punctuate: "true",
      smart_format: "true",
      utterance_end_ms: "5000",
      vad_events: "true",
      endpointing: "800",
    });

    for (const kw of keywordsRef.current) {
      if (kw.trim()) {
        params.append("keywords", `${kw.trim()}:2`);
      }
    }

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params}`,
        ["token", key],
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        flushTimerRef.current = setInterval(flushAudioBuffer, 1000);
        keepAliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 5000);
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "Results") {
            parseResults(data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
        const err = new Error("Deepgram WebSocket 연결 오류");
        onErrorRef.current?.(err);
        reject(err);
      };

      ws.onclose = () => {
        setIsConnected(false);
        cleanupTimers();
      };
    });
  }, [flushAudioBuffer, parseResults]);

  const send = useCallback((chunk: ArrayBuffer) => {
    audioBufferRef.current.push(chunk);
  }, []);

  const cleanupTimers = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    cleanupTimers();

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (audioBufferRef.current.length > 0) {
        const chunks = audioBufferRef.current;
        audioBufferRef.current = [];
        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        ws.send(merged.buffer);
      }

      ws.send(JSON.stringify({ type: "Finalize" }));
      ws.send(JSON.stringify({ type: "CloseStream" }));
      ws.close();
    }

    wsRef.current = null;
    setIsConnected(false);
  }, [cleanupTimers]);

  return { connect, disconnect, send, isConnected };
}

function getDominantSpeaker(words?: DeepgramWord[]): number {
  if (!words || words.length === 0) return 0;

  const counts = new Map<number, number>();
  for (const w of words) {
    if (w.speaker != null) {
      counts.set(w.speaker, (counts.get(w.speaker) || 0) + 1);
    }
  }

  if (counts.size === 0) return 0;

  let maxCount = 0;
  let dominant = 0;
  counts.forEach((count, speaker) => {
    if (count > maxCount) {
      maxCount = count;
      dominant = speaker;
    }
  });
  return dominant;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
}

interface DeepgramResult {
  type: "Results";
  is_final: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: DeepgramAlternative[];
  };
}
