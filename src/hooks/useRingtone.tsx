import { useEffect, useRef, useCallback } from "react";

export const useRingtone = (isPlaying: boolean) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopRingtone = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current = null;
    }
  }, []);

  const playRingTone = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
    }

    const ctx = audioContextRef.current;
    
    // Create oscillator for the ring tone
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Phone-like ring pattern: 440Hz + 480Hz
    oscillator.type = "sine";
    oscillator.frequency.value = 440;
    
    gainNode.gain.value = 0.3;
    
    oscillatorRef.current = oscillator;
    gainNodeRef.current = gainNode;
    
    oscillator.start();
    
    // Ring pattern: 2 seconds on, 4 seconds off
    let isRinging = true;
    
    intervalRef.current = setInterval(() => {
      if (gainNodeRef.current) {
        isRinging = !isRinging;
        gainNodeRef.current.gain.setValueAtTime(isRinging ? 0.3 : 0, ctx.currentTime);
        
        // Add frequency variation for more realistic ring
        if (oscillatorRef.current && isRinging) {
          oscillatorRef.current.frequency.setValueAtTime(440, ctx.currentTime);
          oscillatorRef.current.frequency.setValueAtTime(480, ctx.currentTime + 0.5);
          oscillatorRef.current.frequency.setValueAtTime(440, ctx.currentTime + 1.0);
          oscillatorRef.current.frequency.setValueAtTime(480, ctx.currentTime + 1.5);
        }
      }
    }, 2000);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      playRingTone();
    } else {
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
  }, [isPlaying, playRingTone, stopRingtone]);

  return { stopRingtone };
};
