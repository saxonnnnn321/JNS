import { describe, expect, it } from 'vitest';
import {
  EMPTY_DIRECTORY,
  extractAddress,
  matchCustomer,
  routeCommand,
  type Directory,
} from './commands';

const DIRECTORY: Directory = {
  customers: [
    { id: 'c1', name: 'Dave Thompson' },
    { id: 'c2', name: 'Marg Whitton' },
    { id: 'c3', name: 'Penrith Dental' },
    { id: 'c8', name: 'Ray Mitchell' },
  ],
  properties: [
    { customerId: 'c1', addressLine: '5 Hope Street', suburb: 'Penrith' },
    { customerId: 'c2', addressLine: '12 Short Street', suburb: 'Emu Plains' },
    { customerId: 'c1', addressLine: '2/18 Derby Street', suburb: 'Penrith' },
  ],
};

describe('extractAddress', () => {
  it('finds a plain street address', () => {
    expect(extractAddress('12 Short Street Emu Plains')).toBe(
      '12 Short Street Emu Plains',
    );
  });

  it('finds one buried in a sentence', () => {
    expect(extractAddress('can you quote for 5 Hope Street Penrith please')).toBe(
      '5 Hope Street Penrith',
    );
  });

  it('keeps the postcode when it is given', () => {
    expect(extractAddress('7 Bunyarra Drive Emu Plains 2750')).toBe(
      '7 Bunyarra Drive Emu Plains 2750',
    );
  });

  it('handles a unit number', () => {
    expect(extractAddress('2/18 Derby Street Penrith')).toBe(
      '2/18 Derby Street Penrith',
    );
  });

  it('copes with an abbreviated street type', () => {
    expect(extractAddress('9 Banks Dr St Clair')).toMatch(/^9 Banks Dr/);
  });

  it('handles a two-word street name', () => {
    expect(extractAddress('104 Great Western Highway Emu Plains')).toBe(
      '104 Great Western Highway Emu Plains',
    );
  });

  it('returns null when there is no address', () => {
    expect(extractAddress('the grass is really long out the back')).toBeNull();
    expect(extractAddress('show me the schedule')).toBeNull();
  });
});

describe('matchCustomer', () => {
  it('matches a full name', () => {
    expect(matchCustomer('open Dave Thompson', DIRECTORY)?.id).toBe('c1');
  });

  it('matches a first name on its own', () => {
    expect(matchCustomer('pull up Marg', DIRECTORY)?.id).toBe('c2');
  });

  it('matches a surname on its own', () => {
    expect(matchCustomer('Mitchell', DIRECTORY)?.id).toBe('c8');
  });

  it('reaches the owner through one of their addresses', () => {
    expect(matchCustomer('5 Hope Street', DIRECTORY)?.id).toBe('c1');
  });

  it('prefers the more specific name', () => {
    // Both "Dave" and "Dave Thompson" match; the full name must win so a
    // second Dave on the books never steals the more precise instruction.
    expect(matchCustomer('Dave Thompson', DIRECTORY)?.name).toBe('Dave Thompson');
  });

  it('does not match a stranger', () => {
    expect(matchCustomer('quote for 40 Gipps Street', DIRECTORY)).toBeNull();
  });
});

describe('routeCommand — navigation', () => {
  it('opens the schedule', () => {
    const action = routeCommand("what's on this week", DIRECTORY);
    expect(action).toMatchObject({ kind: 'navigate', href: '/schedule' });
  });

  it('opens the customer list', () => {
    expect(routeCommand('show me the customers', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/customers',
    });
  });

  it('opens the run sheet', () => {
    expect(routeCommand('what am I doing today', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/',
    });
  });

  it('opens a customer by name', () => {
    expect(routeCommand('open Dave Thompson', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/customers/c1',
      say: 'Opening Dave Thompson',
    });
  });
});

describe('routeCommand — quoting', () => {
  it('turns a spoken address into a quote with the lookup armed', () => {
    const action = routeCommand(
      'quote for 40 Gipps Street Kingswood',
      DIRECTORY,
    );
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    const url = new URL(action.href, 'https://x');
    expect(url.pathname).toBe('/quotes/new');
    expect(url.searchParams.get('address')).toBe('40 Gipps Street Kingswood');
    expect(url.searchParams.get('lookup')).toBe('1');
  });

  it('carries the rest of the sentence through as the note', () => {
    const action = routeCommand(
      "quote 40 Gipps Street Kingswood, the lawn's overgrown and they want the beds weeded",
      DIRECTORY,
    );
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    const note = new URL(action.href, 'https://x').searchParams.get('note') ?? '';
    expect(note).toMatch(/overgrown/);
    expect(note).toMatch(/beds weeded/);
    // The address itself must not be repeated into the note.
    expect(note).not.toMatch(/Gipps/);
  });

  it('quotes an existing customer when you ask for a price', () => {
    const action = routeCommand('price up 5 Hope Street Penrith', DIRECTORY);
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    expect(action.href).toContain('/quotes/new');
  });

  it('opens the file, not a quote, when you only say the address', () => {
    // Saying a known address is far more likely to mean "show me them" than
    // "start a brand new quote".
    expect(routeCommand('5 Hope Street', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/customers/c1',
    });
  });
});

describe('routeCommand — falling back', () => {
  it('treats anything else as dictation for the page you are on', () => {
    const action = routeCommand(
      "the grass is really long and there's a dog in the yard",
      DIRECTORY,
    );
    expect(action).toMatchObject({ kind: 'dictate' });
    if (action.kind !== 'dictate') throw new Error('expected dictation');
    expect(action.text).toMatch(/dog in the yard/);
  });

  it('says so plainly when the app cannot do it yet', () => {
    expect(routeCommand('mark that one done', DIRECTORY)).toMatchObject({
      kind: 'unsupported',
    });
  });

  it('opens the invoice list', () => {
    expect(routeCommand('what am I owed', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/invoices',
    });
  });

  it('takes "invoice Dave" to Dave, where the button is', () => {
    // Voice never bills anyone. It opens the page with the button on it.
    expect(routeCommand('invoice Dave Thompson', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/customers/c1',
    });
  });

  it('never invents a destructive action', () => {
    // Nothing the router can return writes to the database. If this ever
    // fails, someone has added an action kind that needs a confirmation step.
    const kinds = [
      routeCommand('delete Dave Thompson', DIRECTORY).kind,
      routeCommand('mark 5 Hope Street done', DIRECTORY).kind,
      routeCommand('charge Dave four hundred dollars', DIRECTORY).kind,
    ];
    expect(kinds.every((k) => ['navigate', 'dictate', 'unsupported', 'unknown'].includes(k))).toBe(true);
  });

  it('handles empty input', () => {
    expect(routeCommand('   ', DIRECTORY).kind).toBe('unknown');
  });
});

describe('routeCommand — adding a customer', () => {
  it('opens the form', () => {
    expect(routeCommand('add a new customer', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/customers/new',
    });
  });

  it('carries an address into the form rather than quoting it', () => {
    // "add a new customer at 12 Short Street" contains an address, but it is
    // the one sentence with an address that must NOT open a quote.
    const action = routeCommand(
      'add a new customer at 40 Gipps Street Kingswood',
      DIRECTORY,
    );
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    const url = new URL(action.href, 'https://x');
    expect(url.pathname).toBe('/customers/new');
    expect(url.searchParams.get('address')).toBe('40 Gipps Street Kingswood');
  });
});

describe('routeCommand — the timesheet', () => {
  it('opens the timesheet with the hours ready, but does not log them', () => {
    // Voice never commits. It fills the form in and you press the button.
    const action = routeCommand('log 3 hours on the Penrith run', DIRECTORY);
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    const url = new URL(action.href, 'https://x');
    expect(url.pathname).toBe('/timesheet');
    expect(url.searchParams.get('hours')).toBe('3');
    expect(url.searchParams.get('what')).toMatch(/Penrith run/);
  });

  it('understands a half hour', () => {
    const action = routeCommand('put down 6 and a half hours', DIRECTORY);
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    expect(new URL(action.href, 'https://x').searchParams.get('hours')).toBe('6.5');
  });

  it('logs time rather than opening a customer when both could match', () => {
    // "5 Hope Street" is Dave's address, but the instruction is about hours.
    const action = routeCommand('worked 4 hours at 5 Hope Street', DIRECTORY);
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    expect(action.href).toContain('/timesheet');
  });

  it('opens the split', () => {
    expect(routeCommand('who owes who', DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/timesheet/split',
    });
  });

  it('does not mistake an hour in a quote note for a timesheet entry', () => {
    const action = routeCommand(
      'quote 40 Gipps Street Kingswood, about an hour of weeding',
      DIRECTORY,
    );
    if (action.kind !== 'navigate') throw new Error('expected a navigation');
    expect(action.href).toContain('/quotes/new');
  });
});

describe('the pages added after the voice router was written', () => {
  it('opens the jobs board', () => {
    expect(routeCommand('open the jobs board', EMPTY_DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/jobs',
    });
    expect(routeCommand("what's in the pipeline", EMPTY_DIRECTORY)).toMatchObject({
      href: '/jobs',
    });
  });

  it('opens receipts', () => {
    expect(routeCommand('show me receipts', EMPTY_DIRECTORY)).toMatchObject({
      kind: 'navigate',
      href: '/receipts',
    });
  });

  it('does not hijack the word "job" said in passing', () => {
    // You talk about the job all day. This has to stay dictation.
    expect(routeCommand('the job took longer than I thought', EMPTY_DIRECTORY)).toMatchObject({
      kind: 'dictate',
    });
  });

  it('sends "receipt for the job" to receipts, not the board', () => {
    expect(routeCommand('receipt for the job', EMPTY_DIRECTORY)).toMatchObject({
      href: '/receipts',
    });
  });
});
