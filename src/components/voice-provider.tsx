'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDictation } from '@/lib/voice/use-dictation';
import { routeCommand, type Directory, type VoiceAction } from '@/lib/voice/commands';
import { MicButton } from './mic-button';

/**
 * One microphone for the whole app.
 *
 * Press it anywhere, say what you want, and the words decide where they land:
 * a page to open, a customer to pull up, an address to quote, or — if it is
 * none of those — text for whichever field the page has offered up.
 *
 * It never saves anything. See the note at the top of lib/voice/commands.ts.
 */

type Target = (text: string) => void;

const VoiceContext = createContext<{
  register: (target: Target | null) => void;
} | null>(null);

/**
 * Called by a page to say "dictation with nowhere better to go belongs here".
 * The quote page points this at its note field.
 */
export function useVoiceTarget(target: Target | null, enabled = true) {
  const context = useContext(VoiceContext);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!context || !enabled) return;
    context.register((text) => targetRef.current?.(text));
    return () => context.register(null);
  }, [context, enabled]);
}

export function VoiceProvider({
  directory,
  children,
}: {
  directory: Directory;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const targetRef = useRef<Target | null>(null);

  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<VoiceAction | null>(null);

  const register = useCallback((target: Target | null) => {
    targetRef.current = target;
  }, []);

  // Memoised, and it must stay that way: this provider re-renders on every
  // word while you are talking, and a fresh context object each time would
  // make every page re-register its field mid-sentence.
  const context = useMemo(() => ({ register }), [register]);

  const act = useCallback(
    (spoken: string) => {
      const action = routeCommand(spoken, directory);

      if (action.kind === 'dictate') {
        if (targetRef.current) {
          targetRef.current(action.text);
        } else {
          // Be honest rather than swallowing it: the words are still on
          // screen in the bar, so nothing is lost.
          setResult({
            kind: 'unknown',
            text: action.text,
            say: 'Nothing on this page to type that into. Try "quote for…" or a customer name.',
          });
          return;
        }
      }

      if (action.kind === 'navigate') router.push(action.href);
      setResult(action);
    },
    [directory, router],
  );

  const voice = useDictation({
    onTranscript: setHeard,
    onDone: (text) => {
      setHeard(text);
      if (text.trim()) act(text);
    },
  });

  // Clear the bar a few seconds after it stops being useful.
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      setResult(null);
      setHeard('');
    }, 6000);
    return () => clearTimeout(timer);
  }, [result]);

  // The login page stands alone, and there is nothing to command before you
  // have signed in.
  const hidden = pathname === '/login';

  return (
    <VoiceContext.Provider value={context}>
      {children}

      {!hidden && voice.supported && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4">
          {(voice.listening || heard || result || voice.error) && (
            <div className="pointer-events-auto max-w-sm rounded-xl border border-black/10 bg-white p-3 text-sm shadow-lg">
              {voice.listening && (
                <p className="text-xs font-semibold uppercase tracking-wider text-leaf">
                  Listening
                </p>
              )}
              {heard && <p className="mt-0.5 text-bark/80">“{heard}”</p>}
              {result && (
                <p
                  className={`mt-1 font-medium ${
                    result.kind === 'unsupported' || result.kind === 'unknown'
                      ? 'text-amber-800'
                      : 'text-leaf'
                  }`}
                >
                  {result.say}
                </p>
              )}
              {voice.error && (
                <p className="mt-1 text-red-600">{voice.error}</p>
              )}
              {!voice.listening && (
                <p className="mt-1 text-xs text-bark/45">
                  Say a customer, an address to quote, or “show me the
                  schedule”.
                </p>
              )}
            </div>
          )}

          <div className="pointer-events-auto">
            <MicButton
              listening={voice.listening}
              onClick={() => {
                setResult(null);
                setHeard('');
                voice.toggle('');
              }}
              label={voice.listening ? 'Stop' : 'Speak'}
              title={voice.listening ? 'Stop listening' : 'Speak a command'}
              className="h-14 rounded-full px-5 shadow-lg"
            />
          </div>
        </div>
      )}
    </VoiceContext.Provider>
  );
}
