import {
  AddressParseError,
  PropertyLookupError,
  lookupProperty,
} from '@/lib/property/lookup';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();
  if (!address) {
    return Response.json({ error: 'Add an ?address=' }, { status: 400 });
  }

  try {
    return Response.json(await lookupProperty(address));
  } catch (cause) {
    if (cause instanceof AddressParseError) {
      return Response.json({ error: cause.message }, { status: 400 });
    }
    if (cause instanceof PropertyLookupError) {
      return Response.json({ error: cause.message }, { status: 404 });
    }
    console.error('property lookup failed', cause);
    return Response.json(
      { error: 'Property lookup failed unexpectedly' },
      { status: 500 },
    );
  }
}
