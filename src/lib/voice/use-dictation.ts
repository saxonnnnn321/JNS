'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assembleTranscript,
  chunksFromResults,
  getRecogniser,
  joinDictation,
  speechErrorMessage,
  type SpeechRecognitionLike,
} from './speech';

/**
 * Hold the microphone open and stream what is said into a text field.
 *
 * The awkward part of the Web Speech API is that a session ends on its own.
 * Mobile Safari in particular stops listening after a second or two of quiet,
 * which is no good when you are walking round the back of a house working out
 * what to say. So we restart it until you actually press stop — with a couple
 * of guards below so a broken microphone cannot spin forever.
 */

/** Stop nursing a session along after this, in case we are left running. */
const MAX_SESSION_MS = 120_000;

/** A session that dies this fast is failing, not listening. Do not restart. */
const THRASH_MS = 400;

export type DictationOptions = {
  /** en-AU matters: it is the difference between Penrith and "pen rith". */
  lang?: string;
  /** Called as you speak, with the field's full new contents. */
  onTranscript: (text: string) => void;
  /** Called once when listening ends, with the settled text. */
  onDone?: (text: string) => void;
};

export type Dictation = {
  /** False on Firefox and anywhere without the API — hide the button. */
  supported: boolean;
  listening: boolean;
  error: string | null;
  /** `base` is whatever is in the field now; speech is added to it. */
  toggle: (base: string) => void;
  stop: () => void;
};

export function useDictation({
  lang = 'en-AU',
  onTranscript,
  onDone,
}: DictationOptions): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The live recogniser, plus the bookkeeping its callbacks need. These are
  // refs because the callbacks are wired once per session and must not go
  // stale, and because changing them should never trigger a re-render.
  const recogniserRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const baseRef = useRef('');
  const startedAtRef = useRef(0);
  const sessionStartedAtRef = useRef(0);

  // Latest callbacks, so a session started three renders ago still calls the
  // current ones.
  const handlersRef = useRef({ onTranscript, onDone });
  handlersRef.current = { onTranscript, onDone };

  // Detected after mount, never during render: the server has no `window`, and
  // a value that differs between the two renders is a hydration mismatch.
  useEffect(() => {
    setSupported(getRecogniser() !== null);
  }, []);

  const launch = useCallback(() => {
    const Recogniser = getRecogniser();
    if (!Recogniser) return;

    // A fresh instance each time. Reusing one across restarts is where Safari
    // starts returning results from the previous session.
    const recogniser = new Recogniser();
    recogniser.lang = lang;
    recogniser.continuous = true;
    recogniser.interimResults = true;
    recogniser.maxAlternatives = 1;

    let finalText = '';

    recogniser.onresult = (event) => {
      const { final, interim } = assembleTranscript(
        chunksFromResults(event.results),
      );
      finalText = final;
      const spoken = [final, interim].filter(Boolean).join(' ');
      handlersRef.current.onTranscript(joinDictation(baseRef.current, spoken));
    };

    recogniser.onerror = (event) => {
      const message = speechErrorMessage(event.error);
      if (message) {
        // A real fault. Give up rather than restart into the same wall.
        wantRef.current = false;
        setError(message);
      }
    };

    recogniser.onend = () => {
      // Whatever was settled this session becomes part of the base, because
      // the next session's results start again from nothing. Skipping this is
      // how dictation ends up repeating or swallowing a sentence.
      baseRef.current = joinDictation(baseRef.current, finalText);

      const tooLong = Date.now() - sessionStartedAtRef.current > MAX_SESSION_MS;
      const thrashing = Date.now() - startedAtRef.current < THRASH_MS;

      if (wantRef.current && !tooLong && !thrashing) {
        launch();
        return;
      }

      wantRef.current = false;
      recogniserRef.current = null;
      setListening(false);
      handlersRef.current.onTranscript(baseRef.current);
      handlersRef.current.onDone?.(baseRef.current);
    };

    try {
      startedAtRef.current = Date.now();
      recogniser.start();
      recogniserRef.current = recogniser;
    } catch {
      // `start()` throws if a session is somehow already live. Treat it as a
      // stop rather than leaving the button stuck on "listening".
      wantRef.current = false;
      recogniserRef.current = null;
      setListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    wantRef.current = false;
    recogniserRef.current?.stop();
  }, []);

  const toggle = useCallback(
    (base: string) => {
      if (wantRef.current) {
        stop();
        return;
      }
      setError(null);
      baseRef.current = base;
      wantRef.current = true;
      sessionStartedAtRef.current = Date.now();
      setListening(true);
      launch();
    },
    [launch, stop],
  );

  // Leaving the page with the microphone open would keep the browser's
  // recording indicator on.
  useEffect(() => {
    return () => {
      wantRef.current = false;
      recogniserRef.current?.abort();
      recogniserRef.current = null;
    };
  }, []);

  return { supported, listening, error, toggle, stop };
}
