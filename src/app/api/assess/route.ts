import { z } from 'zod';
import { SiteAssessmentError, assessSite } from '@/lib/assess/site';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Phone photos are resized client-side before upload; this is the backstop. */
const MAX_PHOTOS = 6;

/**
 * Vercel rejects request bodies over 4.5 MB at the infrastructure layer, before
 * any of this code runs, with a bare 413. The client compresses to stay well
 * under — this check exists so that if it ever fails to, the message says what
 * actually went wrong instead of leaving a mystery in the network tab.
 */
const MAX_PAYLOAD_BYTES = 4_000_000;

const bodySchema = z.object({
  photos: z
    .array(
      z.object({
        data: z.string().min(1),
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      }),
    )
    .max(MAX_PHOTOS, `${MAX_PHOTOS} photos is plenty`)
    .default([]),
  note: z.string().max(4000).default(''),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 422 },
    );
  }

  const payloadBytes = parsed.data.photos.reduce(
    (total, photo) => total + photo.data.length,
    0,
  );
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    return Response.json(
      {
        error: `Those photos come to ${Math.round(payloadBytes / 1_000_000)} MB, over the ${
          MAX_PAYLOAD_BYTES / 1_000_000
        } MB upload limit. Remove one and try again.`,
      },
      { status: 413 },
    );
  }

  try {
    return Response.json(
      await assessSite(parsed.data.photos, parsed.data.note),
    );
  } catch (cause) {
    if (cause instanceof SiteAssessmentError) {
      return Response.json({ error: cause.message }, { status: 400 });
    }
    console.error('site assessment failed', cause);
    return Response.json({ error: 'Assessment failed' }, { status: 500 });
  }
}
