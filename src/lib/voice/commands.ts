/**
 * Working out what you meant, and where it should go.
 *
 * You press one button anywhere in the app and talk. This turns the words into
 * an action: open a page, start a quote for an address, pull up a customer, or
 * — failing all that — just type what you said into the field you were looking
 * at.
 *
 * Two rules hold the whole thing together:
 *
 *   1. It is a pure function. Given the same words and the same customer list
 *      it always decides the same thing, and it can be tested without a
 *      browser, a network, or a microphone.
 *
 *   2. **Voice never commits anything.** It navigates and it fills fields in.
 *      Pressing save is still your job. A misheard word should never be able
 *      to change a price, delete a customer, or send a quote — the worst it
 *      can do is open the wrong page, and the back button fixes that.
 */

import { tidyAddress, tidyTranscript } from './speech';

export type VoiceAction =
  /** Go somewhere. `say` is the sentence shown back to you. */
  | { kind: 'navigate'; href: string; say: string }
  /** Put these words in the field on the page you are already on. */
  | { kind: 'dictate'; text: string; say: string }
  /** Understood, but the app cannot do it yet. Better than silence. */
  | { kind: 'unsupported'; say: string }
  | { kind: 'unknown'; text: string; say: string };

/** What the router is allowed to know about, passed in to keep it pure. */
export type Directory = {
  customers: { id: string; name: string }[];
  properties: { customerId: string; addressLine: string; suburb: string }[];
};

export const EMPTY_DIRECTORY: Directory = { customers: [], properties: [] };

/**
 * Street types as people actually say them, long and short. Anything ending in
 * one of these, with a number in front, is an address.
 */
const STREET_TYPES =
  'street|st|road|rd|drive|dr|avenue|ave|av|close|cl|place|pl|court|ct|' +
  'crescent|cres|lane|ln|way|parade|pde|terrace|tce|grove|gr|circuit|cct|' +
  'boulevard|bvd|highway|hwy|esplanade|esp|row|rise|glade|mews|square|sq';

/**
 * The core of an address: a house number (allowing "2/18" for units and "5a"),
 * a street name of up to four words, and a street type. The suburb is NOT part
 * of this — see `findAddress`, which walks forward from here.
 */
const ADDRESS_CORE = new RegExp(
  String.raw`\b(\d+[a-z]?(?:\s*/\s*\d+[a-z]?)?)\s+` +
    String.raw`([a-z']+(?:\s+[a-z']+){0,3}?)\s+` +
    String.raw`(${STREET_TYPES})\b`,
  'i',
);

/**
 * Words that mean the address has finished and you have started describing the
 * job. A suburb is never one of these, so they are a safe place to stop.
 */
const NOT_A_SUBURB =
  /^(the|a|an|and|then|please|thanks|thank|mate|its|it'?s|they|he|she|we|i|is|was|has|have|needs?|wants?|with|about|for|to|take|takes|got|there|their|lawn|lawns|grass|yard|garden|beds?|dog|gate|back|front|side|customer|client|house|place|job|out|really|very|bit|quite)$/i;

/**
 * Checked before the address rules, because "add a new customer at 12 Short
 * Street" contains an address but is emphatically not a request for a quote.
 */
const ADD_CUSTOMER =
  /\b(add|new|create|set\s*up)\s+(a\s+)?(customer|client)\b|\badd\s+(them|him|her)\s+to\s+the\s+books\b/i;

const QUOTE_WORDS =
  /\b(quote|quoting|price|pricing|price up|how much|new job|estimate)\b/i;

const NAV_TARGETS: { href: string; label: string; match: RegExp }[] = [
  {
    href: '/schedule',
    label: 'the schedule',
    match: /\b(schedule|calendar|this week|next week|the round|upcoming)\b/i,
  },
  {
    href: '/customers',
    label: 'customers',
    match: /\b(customers?|client list|customer list|the books)\b/i,
  },
  {
    href: '/quotes/new',
    label: 'a new quote',
    match: /\b(new quote|blank quote|start a quote|quote page)\b/i,
  },
  {
    href: '/',
    label: "today's run sheet",
    match: /\b(today|run sheet|home|what'?s on|whats on|dashboard)\b/i,
  },
];

/** Things it is reasonable to ask for that the app genuinely cannot do yet. */
const NOT_BUILT: { match: RegExp; say: string }[] = [
  {
    match: /\b(invoice|invoicing|send the invoice|bill them)\b/i,
    say: 'Invoicing is not built yet.',
  },
  {
    match: /\b(mark|tick)\b.*\b(done|complete|finished)\b/i,
    say: 'Ticking jobs off by voice is not built yet.',
  },
];

function normalise(text: string): string {
  return tidyTranscript(text).toLowerCase().replace(/[.,!?;:]/g, '');
}

/**
 * Locate an address and say where in the sentence it sat, so the words around
 * it can become the note.
 *
 * The suburb is collected by walking forward from the street type rather than
 * by regex, because the thing that ends a suburb is context, not a pattern:
 * a comma, a postcode, a word that belongs to a sentence about grass, or
 * simply running out of room. "12 Short Street Emu Plains" and "12 Short
 * Street, the lawn is long" have to come apart in different places.
 */
function findAddress(
  text: string,
): { address: string; start: number; end: number } | null {
  const tidy = tidyTranscript(text);
  const core = ADDRESS_CORE.exec(tidy);
  if (!core) return null;

  const [matched, number, name, type] = core;
  const start = core.index;
  let end = start + matched.length;

  const extra: string[] = [];
  let postcode = '';
  const rest = tidy.slice(end);
  // Separator, then a word. Up to three words of suburb, which covers
  // everything from "Penrith" to "Mount Druitt West".
  const walker = /^([\s,]+)([A-Za-z']+|\d{4})/;
  let cursor = 0;
  while (extra.length < 3) {
    const step = walker.exec(rest.slice(cursor));
    if (!step) break;
    const [whole, separator, word] = step;

    // A comma once the suburb has started means the address is over.
    if (extra.length > 0 && separator.includes(',')) break;

    if (/^\d{4}$/.test(word)) {
      postcode = word;
      cursor += whole.length;
      break;
    }
    if (NOT_A_SUBURB.test(word)) break;

    extra.push(word);
    cursor += whole.length;
  }
  end += cursor;

  const address = tidyAddress(
    [
      `${number.replace(/\s*\/\s*/, '/')} ${name} ${type}`,
      extra.join(' '),
      postcode,
    ]
      .filter(Boolean)
      .join(' '),
  );
  return { address, start, end };
}

/** Pull a street address out of a sentence, or null. */
export function extractAddress(text: string): string | null {
  return findAddress(text)?.address ?? null;
}

/**
 * Find the customer being talked about. Matches a full name first, then a
 * first name, then an address they are on the books for — "Dave", "Thompson"
 * and "5 Hope Street" should all reach the same person.
 *
 * Short names are ignored on their own, because a two-letter match inside an
 * unrelated sentence is a coincidence, not an instruction.
 */
export function matchCustomer(
  text: string,
  directory: Directory,
): { id: string; name: string } | null {
  const haystack = normalise(text);
  const candidates: { id: string; name: string; weight: number }[] = [];

  for (const customer of directory.customers) {
    const full = normalise(customer.name);
    if (full.length >= 3 && haystack.includes(full)) {
      candidates.push({ ...customer, weight: full.length + 100 });
      continue;
    }
    for (const part of full.split(/\s+|&/)) {
      if (part.length < 3) continue;
      if (new RegExp(`\\b${escapeRegExp(part)}\\b`).test(haystack)) {
        candidates.push({ ...customer, weight: part.length });
      }
    }
  }

  for (const property of directory.properties) {
    const line = normalise(property.addressLine);
    if (line.length >= 3 && haystack.includes(line)) {
      const owner = directory.customers.find((c) => c.id === property.customerId);
      if (owner) candidates.push({ ...owner, weight: line.length + 50 });
    }
  }

  if (candidates.length === 0) return null;
  // The longest, most specific match wins: "Dave Thompson" over "Dave".
  candidates.sort((a, b) => b.weight - a.weight);
  const { id, name } = candidates[0];
  return { id, name };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whatever is left once the address and the command words are taken out —
 * "the lawn's overgrown, take the clippings". Carried through to the quote's
 * note field, because that sentence is the most valuable thing you said.
 */
function remainderAsNote(text: string, span: { start: number; end: number } | null): string {
  const tidy = tidyTranscript(text);
  let rest = span ? tidy.slice(0, span.start) + ' ' + tidy.slice(span.end) : tidy;
  rest = rest
    .replace(QUOTE_WORDS, ' ')
    .replace(/\b(for|at|on|the|a|an|please|and)\b/gi, (word, _m, offset) =>
      // Only strip these where they are leftover glue at the very start.
      offset < 12 ? ' ' : word,
    )
    .replace(/^[\s,.-]+/, '');
  return tidyTranscript(rest);
}

export function routeCommand(raw: string, directory: Directory): VoiceAction {
  const text = tidyTranscript(raw);
  if (!text) return { kind: 'unknown', text: '', say: 'Did not catch that.' };

  for (const { match, say } of NOT_BUILT) {
    if (match.test(text)) return { kind: 'unsupported', say };
  }

  const found = findAddress(text);
  const address = found?.address ?? null;
  const wantsQuote = QUOTE_WORDS.test(text);

  // Putting someone on the books. Carry the address over if one was said, so
  // the form opens half filled in.
  if (ADD_CUSTOMER.test(text)) {
    const params = new URLSearchParams();
    if (address) params.set('address', address);
    const query = params.toString();
    return {
      kind: 'navigate',
      href: query ? `/customers/new?${query}` : '/customers/new',
      say: address ? `New customer at ${address}` : 'Adding a customer',
    };
  }

  // An address plus "quote" is the flagship: say a street, get a price. The
  // page reads these back off the URL and runs the lookup on arrival.
  if (address && (wantsQuote || !matchCustomer(text, directory))) {
    const note = remainderAsNote(text, found);
    const params = new URLSearchParams({ address, lookup: '1' });
    if (note) params.set('note', note);
    return {
      kind: 'navigate',
      href: `/quotes/new?${params.toString()}`,
      say: `Quoting ${address}${note ? ' — and I kept your note' : ''}`,
    };
  }

  // A name, or one of their addresses, opens their file.
  const customer = matchCustomer(text, directory);
  if (customer && !wantsQuote) {
    return {
      kind: 'navigate',
      href: `/customers/${customer.id}`,
      say: `Opening ${customer.name}`,
    };
  }

  // A known customer, but you asked for a price — quote their place.
  if (customer && wantsQuote && address) {
    const params = new URLSearchParams({ address, lookup: '1' });
    return {
      kind: 'navigate',
      href: `/quotes/new?${params.toString()}`,
      say: `Quoting ${address} for ${customer.name}`,
    };
  }

  for (const target of NAV_TARGETS) {
    if (target.match.test(text)) {
      return {
        kind: 'navigate',
        href: target.href,
        say: `Opening ${target.label}`,
      };
    }
  }

  // Nothing matched a command, so you were almost certainly just talking about
  // the job. Put it in the field in front of you.
  return { kind: 'dictate', text, say: 'Added to the page' };
}
