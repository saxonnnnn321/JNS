/**
 * Speech-to-text, for the times you are standing in someone's yard with
 * gloves on and a phone in one hand.
 *
 * This uses the browser's own Web Speech API. Nothing here costs money, needs
 * an API key, or touches our server — the browser hands the audio to Google
 * (Chrome/Android) or Apple (Safari/iOS), the same machinery behind the little
 * microphone key on the phone keyboard, and hands back text. We never see or
 * store the audio.
 *
 * Everything in this file is deliberately pure except `getRecogniser`, so the
 * fiddly parts — stitching partial results together, cleaning up a spoken
 * address — can be tested without a browser.
 */

/**
 * TypeScript's `lib.dom` ships the *result* types (SpeechRecognitionResult and
 * friends) but not the recogniser itself, because that interface has never
 * been standardised. These cover only the parts we touch, and are named
 * `...Like` so they can never collide with a future lib.dom definition.
 */
export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechResultEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

type RecogniserConstructor = new () => SpeechRecognitionLike;

/**
 * Safari has only ever shipped the prefixed name, and Firefox ships neither.
 * Returns null when the browser cannot do this at all, which is the signal for
 * the UI to hide the microphone button rather than show one that does nothing.
 */
export function getRecogniser(): RecogniserConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecogniserConstructor;
    webkitSpeechRecognition?: RecogniserConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpokenChunk = { text: string; isFinal: boolean };

/**
 * A recognition event carries *every* result for the session so far, not just
 * the new one. Reading only the latest loses words; concatenating events
 * duplicates them. So we rebuild the whole thing from the list each time and
 * keep the settled text apart from the words still being revised.
 */
export function assembleTranscript(chunks: SpokenChunk[]): {
  final: string;
  interim: string;
} {
  const final: string[] = [];
  const interim: string[] = [];
  for (const chunk of chunks) {
    const text = chunk.text.trim();
    if (!text) continue;
    (chunk.isFinal ? final : interim).push(text);
  }
  return { final: final.join(' '), interim: interim.join(' ') };
}

/** Pull the browser's result list into something plain and testable. */
export function chunksFromResults(
  results: SpeechRecognitionResultList,
): SpokenChunk[] {
  const chunks: SpokenChunk[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    chunks.push({ text: result[0]?.transcript ?? '', isFinal: result.isFinal });
  }
  return chunks;
}

/**
 * Add dictated words to whatever is already in the field. Speaking should
 * extend a note, never wipe out what you typed a minute ago.
 */
export function joinDictation(base: string, spoken: string): string {
  const words = spoken.trim();
  if (!words) return base;
  if (!base) return words;
  return /\s$/.test(base) ? base + words : `${base} ${words}`;
}

/** Collapse the whitespace a dictation engine sprinkles in. */
export function tidyTranscript(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * The same, plus the two habits that stop a spoken address matching in the
 * cadastre: a full stop on the end, and the state read out letter by letter.
 *
 * Deliberately nothing else. It is tempting to turn spoken numbers into
 * digits, but "Five Dock" is a real Sydney suburb and "5 Dock" is not — the
 * address stays visible and editable in the box, which is a better safety net
 * than a clever guess.
 */
export function tidyAddress(raw: string): string {
  return tidyTranscript(raw)
    .replace(/\bn[.\s]*s[.\s]*w\b\.?/gi, 'NSW')
    .replace(/[.,!?;]+$/, '')
    .trim();
}

/**
 * Worth looking up? Every real address has a number and more than one word.
 * Used to decide whether to fire the lookup automatically when you stop
 * talking, so a cough does not burn a request.
 */
export function looksLikeAddress(text: string): boolean {
  const tidy = tidyTranscript(text);
  return /\d/.test(tidy) && tidy.split(' ').length >= 3;
}

/**
 * Plain English for the handful of things that go wrong, and `null` for the
 * two that are not really errors — pausing to think, or pressing stop. Those
 * should not flash a red warning at you.
 */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone blocked. Allow it for this site in your browser settings, then try again.';
    case 'audio-capture':
      return 'No microphone found on this device.';
    case 'network':
      return 'Speech needs a connection — you look to be offline.';
    default:
      return 'Did not catch that. Try again, or type it.';
  }
}
