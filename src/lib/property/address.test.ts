import { describe, expect, it } from 'vitest';
import { AddressParseError, parseAddress } from './address';

describe('parseAddress', () => {
  it('parses a plain suburban address', () => {
    expect(parseAddress('12 Short Street Emu Plains 2750')).toEqual({
      unit: undefined,
      houseNumber: '12',
      roadName: 'Short',
      roadType: 'Street',
      suburb: 'Emu Plains',
      postcode: '2750',
    });
  });

  it('copes with commas and the state', () => {
    expect(parseAddress('7 Bunyarra Drive, Emu Plains, NSW 2750')).toMatchObject({
      houseNumber: '7',
      roadName: 'Bunyarra',
      roadType: 'Drive',
      suburb: 'Emu Plains',
      postcode: '2750',
    });
  });

  it('expands abbreviated road types', () => {
    expect(parseAddress('5 Hope St Penrith')).toMatchObject({
      roadName: 'Hope',
      roadType: 'Street',
      suburb: 'Penrith',
    });
    expect(parseAddress('9 Jamison Rd Kingswood')).toMatchObject({
      roadType: 'Road',
    });
  });

  it('keeps multi-word road names together', () => {
    expect(parseAddress('101 Great Western Highway Penrith 2750')).toMatchObject({
      roadName: 'Great Western',
      roadType: 'Highway',
      suburb: 'Penrith',
    });
  });

  it('does not mistake a road name for the road type', () => {
    // "Park" is a valid road type, but here it is the street's name.
    expect(parseAddress('12 Park Road Kingswood')).toMatchObject({
      roadName: 'Park',
      roadType: 'Road',
      suburb: 'Kingswood',
    });
  });

  it('handles unit numbers', () => {
    expect(parseAddress('3/12 Short Street Emu Plains')).toMatchObject({
      unit: '3',
      houseNumber: '12',
      roadName: 'Short',
    });
    expect(parseAddress('Unit 5 22 Henry Street Penrith')).toMatchObject({
      unit: '5',
      houseNumber: '22',
      roadName: 'Henry',
    });
  });

  it('handles a letter suffix on the number', () => {
    expect(parseAddress('12A Short Street Emu Plains')).toMatchObject({
      houseNumber: '12A',
    });
  });

  it('asks for a street number when there is none', () => {
    expect(() => parseAddress('Short Street Emu Plains')).toThrow(AddressParseError);
    expect(() => parseAddress('   ')).toThrow(AddressParseError);
  });
});
