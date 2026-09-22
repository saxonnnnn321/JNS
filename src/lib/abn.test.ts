import { describe, expect, it } from 'vitest';
import { formatAbn, isValidAbn, normaliseAbn } from './abn';

describe('isValidAbn', () => {
  it('accepts the JNS ABN', () => {
    expect(isValidAbn('79123765026')).toBe(true);
    expect(isValidAbn('79 123 765 026')).toBe(true);
  });

  it('accepts other real, published ABNs', () => {
    // Australian Taxation Office, and Telstra — both public record.
    expect(isValidAbn('51 824 753 556')).toBe(true);
    expect(isValidAbn('33 051 775 556')).toBe(true);
  });

  it('rejects the placeholder', () => {
    expect(isValidAbn('00 000 000 000')).toBe(false);
  });

  it('catches a single transposed digit', () => {
    // The whole point of the checksum: 79123765026 -> 79123765062.
    expect(isValidAbn('79123765062')).toBe(false);
  });

  it('rejects the wrong number of digits', () => {
    expect(isValidAbn('7912376502')).toBe(false);
    expect(isValidAbn('791237650267')).toBe(false);
    expect(isValidAbn('')).toBe(false);
  });
});

describe('formatAbn', () => {
  it('groups it the way the ATO prints it', () => {
    expect(formatAbn('79123765026')).toBe('79 123 765 026');
  });

  it('leaves anything unexpected alone rather than mangling it', () => {
    expect(formatAbn('not an abn')).toBe('not an abn');
  });
});

describe('normaliseAbn', () => {
  it('strips the spaces', () => {
    expect(normaliseAbn('79 123 765 026')).toBe('79123765026');
  });
});
