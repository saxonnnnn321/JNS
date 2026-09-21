/**
 * Free-text address → the structured fields the NSW address service demands.
 *
 * The SIX Maps Address_Location endpoint refuses a plain address string: it
 * wants houseNumber / roadName / roadType / suburb / postCode separately. So we
 * pull a typed address apart here.
 *
 * This is deliberately forgiving. The service does its own fuzzy matching and
 * hands back the address it actually used, which we always show to the operator
 * so a wrong match is obvious before it becomes a wrong quote.
 */

/** Abbreviation → the full word the NSW service indexes on. */
const ROAD_TYPES: Record<string, string> = {
  street: 'Street', st: 'Street',
  road: 'Road', rd: 'Road',
  avenue: 'Avenue', ave: 'Avenue', av: 'Avenue',
  drive: 'Drive', dr: 'Drive', drv: 'Drive',
  court: 'Court', ct: 'Court',
  place: 'Place', pl: 'Place',
  crescent: 'Crescent', cres: 'Crescent', cr: 'Crescent',
  close: 'Close', cl: 'Close',
  lane: 'Lane', ln: 'Lane',
  parade: 'Parade', pde: 'Parade',
  terrace: 'Terrace', tce: 'Terrace',
  circuit: 'Circuit', cct: 'Circuit',
  boulevarde: 'Boulevarde', boulevard: 'Boulevard', blvd: 'Boulevard',
  highway: 'Highway', hwy: 'Highway',
  way: 'Way',
  grove: 'Grove', gr: 'Grove',
  esplanade: 'Esplanade', esp: 'Esplanade',
  parkway: 'Parkway', pwy: 'Parkway',
  square: 'Square', sq: 'Square',
  rise: 'Rise',
  ridge: 'Ridge',
  glen: 'Glen',
  loop: 'Loop',
  mews: 'Mews',
  walk: 'Walk',
  track: 'Track', trk: 'Track',
  park: 'Park',
  gardens: 'Gardens', gdns: 'Gardens',
  circle: 'Circle', cir: 'Circle',
  alley: 'Alley',
  bypass: 'Bypass',
  chase: 'Chase',
  concourse: 'Concourse',
  cove: 'Cove',
  crossing: 'Crossing',
  dale: 'Dale',
  entrance: 'Entrance',
  green: 'Green',
  grange: 'Grange',
  heights: 'Heights',
  hill: 'Hill',
  island: 'Island',
  junction: 'Junction',
  key: 'Key',
  link: 'Link',
  mall: 'Mall',
  outlook: 'Outlook',
  pocket: 'Pocket',
  point: 'Point',
  promenade: 'Promenade',
  quay: 'Quay',
  reserve: 'Reserve',
  retreat: 'Retreat',
  row: 'Row',
  run: 'Run',
  vale: 'Vale',
  view: 'View',
  vista: 'Vista',
  wharf: 'Wharf',
};

export interface ParsedAddress {
  unit?: string;
  houseNumber: string;
  roadName: string;
  roadType?: string;
  suburb?: string;
  postcode?: string;
}

export class AddressParseError extends Error {}

export function parseAddress(raw: string): ParsedAddress {
  let text = raw
    .replace(/,/g, ' ')
    .replace(/\b(n\.?s\.?w\.?|new south wales|australia|aus)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) throw new AddressParseError('Enter an address');

  // Trailing 4-digit postcode.
  let postcode: string | undefined;
  const postcodeMatch = text.match(/\b(\d{4})\s*$/);
  if (postcodeMatch) {
    postcode = postcodeMatch[1];
    text = text.slice(0, postcodeMatch.index).trim();
  }

  // Leading unit / house number: "3/12A", "Unit 3 12", "12A", "12-14".
  let unit: string | undefined;
  const unitMatch = text.match(/^(?:unit|u|apt|apartment|flat|shop)\s*([\w-]+)\s+/i);
  if (unitMatch) {
    unit = unitMatch[1];
    text = text.slice(unitMatch[0].length).trim();
  }

  const slashMatch = text.match(/^([\w-]+)\s*\/\s*(\d+[a-z]?)\s+/i);
  if (slashMatch) {
    unit = unit ?? slashMatch[1];
    text = `${slashMatch[2]} ${text.slice(slashMatch[0].length)}`.trim();
  }

  const numberMatch = text.match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)\s+/i);
  if (!numberMatch) {
    throw new AddressParseError(
      'Start with the street number, e.g. "12 Short Street Emu Plains"',
    );
  }
  const houseNumber = numberMatch[1];
  const rest = text.slice(numberMatch[0].length).trim();

  const tokens = rest.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    throw new AddressParseError('Add a street name');
  }

  // First token that is a road type AND has a road name in front of it. The
  // guard matters for streets like "Park Road", where the first word is itself
  // a valid road type.
  let typeIndex = -1;
  for (let i = 1; i < tokens.length; i += 1) {
    if (ROAD_TYPES[tokens[i].toLowerCase()]) {
      typeIndex = i;
      break;
    }
  }

  if (typeIndex === -1) {
    // No recognisable type — treat the last token as the suburb and let the
    // service fuzzy match the rest.
    return {
      unit,
      houseNumber,
      roadName: tokens.slice(0, Math.max(1, tokens.length - 1)).join(' '),
      suburb: tokens.length > 1 ? tokens[tokens.length - 1] : undefined,
      postcode,
    };
  }

  return {
    unit,
    houseNumber,
    roadName: tokens.slice(0, typeIndex).join(' '),
    roadType: ROAD_TYPES[tokens[typeIndex].toLowerCase()],
    suburb: tokens.slice(typeIndex + 1).join(' ') || undefined,
    postcode,
  };
}
