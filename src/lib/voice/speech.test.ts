import { describe, expect, it } from 'vitest';
import {
  assembleTranscript,
  joinDictation,
  looksLikeAddress,
  speechErrorMessage,
  tidyAddress,
  tidyTranscript,
} from './speech';

describe('assembleTranscript', () => {
  it('keeps settled words apart from the ones still being revised', () => {
    const { final, interim } = assembleTranscript([
      { text: 'the lawn is overgrown', isFinal: true },
      { text: 'customer wants', isFinal: false },
    ]);
    expect(final).toBe('the lawn is overgrown');
    expect(interim).toBe('customer wants');
  });

  it('rebuilds the whole session rather than just the newest result', () => {
    // The browser hands us every result each time. If we only read the last
    // one the earlier sentences vanish from the note.
    const { final } = assembleTranscript([
      { text: 'grass is long', isFinal: true },
      { text: 'take the clippings', isFinal: true },
      { text: 'dog in the yard', isFinal: true },
    ]);
    expect(final).toBe('grass is long take the clippings dog in the yard');
  });

  it('drops the empty chunks a recogniser emits between phrases', () => {
    const { final, interim } = assembleTranscript([
      { text: '  ', isFinal: true },
      { text: 'about an hour', isFinal: true },
      { text: '', isFinal: false },
    ]);
    expect(final).toBe('about an hour');
    expect(interim).toBe('');
  });
});

describe('joinDictation', () => {
  it('extends what is already typed instead of replacing it', () => {
    expect(joinDictation('Mow and edge.', 'Also weed the beds')).toBe(
      'Mow and edge. Also weed the beds',
    );
  });

  it('does not double the space when the note already ends in one', () => {
    expect(joinDictation('Mow and edge. ', 'Also weed')).toBe(
      'Mow and edge. Also weed',
    );
  });

  it('leaves the note alone when nothing was heard', () => {
    expect(joinDictation('Mow and edge.', '   ')).toBe('Mow and edge.');
  });

  it('starts clean from an empty field', () => {
    expect(joinDictation('', 'this one is overgrown')).toBe(
      'this one is overgrown',
    );
  });
});

describe('tidyAddress', () => {
  it('strips the full stop dictation puts on the end', () => {
    expect(tidyAddress('12 Short Street, Emu Plains 2750.')).toBe(
      '12 Short Street, Emu Plains 2750',
    );
  });

  it('rejoins the state when it is read out letter by letter', () => {
    expect(tidyAddress('5 Hope Street Penrith n s w 2750')).toBe(
      '5 Hope Street Penrith NSW 2750',
    );
    expect(tidyAddress('5 Hope Street Penrith N.S.W. 2750')).toBe(
      '5 Hope Street Penrith NSW 2750',
    );
  });

  it('leaves spoken numbers alone, because suburbs are named after them', () => {
    // "Five Dock" is a real suburb. Turning the word into a digit would
    // quietly break the lookup for everyone who lives there.
    expect(tidyAddress('20 Great North Road Five Dock')).toBe(
      '20 Great North Road Five Dock',
    );
  });

  it('collapses the gaps', () => {
    expect(tidyAddress('  7   Bunyarra   Drive  ')).toBe('7 Bunyarra Drive');
  });
});

describe('tidyTranscript', () => {
  it('collapses whitespace without touching punctuation', () => {
    expect(tidyTranscript('  grass is   long.  ')).toBe('grass is long.');
  });
});

describe('looksLikeAddress', () => {
  it('accepts a street address', () => {
    expect(looksLikeAddress('12 Short Street Emu Plains')).toBe(true);
  });

  it('rejects a cough or a stray word, so no lookup is wasted', () => {
    expect(looksLikeAddress('um')).toBe(false);
    expect(looksLikeAddress('Short Street')).toBe(false);
    expect(looksLikeAddress('')).toBe(false);
  });
});

describe('speechErrorMessage', () => {
  it('stays quiet when you simply paused or pressed stop', () => {
    expect(speechErrorMessage('no-speech')).toBeNull();
    expect(speechErrorMessage('aborted')).toBeNull();
  });

  it('explains a blocked microphone in terms of the fix', () => {
    expect(speechErrorMessage('not-allowed')).toMatch(/browser settings/);
  });

  it('has something to say about anything else', () => {
    expect(speechErrorMessage('weird-new-code')).toBeTruthy();
  });
});
