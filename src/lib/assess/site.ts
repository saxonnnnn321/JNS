/**
 * Photos and a note → site conditions and any extra work asked for.
 *
 * Two kinds of evidence go in:
 *
 *   PHOTOS  — good at showing how bad a job is. Inference.
 *   THE NOTE — what the operator says. This is not inference, it is testimony
 *              from the person who will do the work, and it OUTRANKS the photos
 *              wherever the two disagree.
 *
 * That ordering matters. "This one's overgrown" typed by Saxon is worth more
 * than a model squinting at a photo taken at dusk, and the prompt says so.
 *
 * Still true here as everywhere: no prices come out of the model. It picks the
 * rate card's own condition buckets and repeats back any quantities or times
 * the operator stated. The pricing engine does the money.
 */

import Anthropic from '@anthropic-ai/sdk';
// The SDK's zod helper is built against Zod v4 internals. zod 3.25 ships that
// as the `zod/v4` subpath, so this file uses it while the rest of the project
// stays on the v3 API it was written against.
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { RATE_CARD } from '../rate-card';
import type { LabourAddition, SiteConditions } from '../types';

export class SiteAssessmentError extends Error {}

export interface PhotoInput {
  /** Base64 WITHOUT the data: URL prefix. */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export const OPTIONAL_TASKS = ['bedTidy', 'weed', 'hedge'] as const;
export type OptionalTask = (typeof OPTIONAL_TASKS)[number];

const SiteAssessmentSchema = z.object({
  grassHeight: z.enum(['short', 'normal', 'long', 'overgrown', 'severe']),
  obstacleDensity: z.enum(['none', 'low', 'moderate', 'high']),
  slope: z.enum(['flat', 'gentle', 'moderate', 'steep']),
  access: z.enum(['open', 'standardGate', 'narrowGate', 'stairsOnly']),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'Overall confidence, 0 to 1. Conditions the operator stated outright are near certain. Conditions you inferred from a photo are less so. Conditions neither mentioned nor visible should pull this down hard.',
    ),
  requestedWork: z
    .array(z.enum(OPTIONAL_TASKS))
    .describe(
      'Extra services the operator asked for WITHOUT giving a time. Leave a task out if they gave a time for it — that belongs in statedLabour instead, or it gets charged twice.',
    ),
  statedLabour: z
    .array(
      z.object({
        description: z
          .string()
          .describe('Short line as it should read on the quote.'),
        minutes: z.number().min(1).max(1440),
      }),
    )
    .describe(
      'Work the operator gave an explicit time for, e.g. "weeding for about an hour" becomes 60 minutes. Empty if none.',
    ),
  greenWasteM3: z
    .number()
    .min(0)
    .max(20)
    .nullable()
    .describe(
      'Cubic metres of green waste to be taken away, only if the operator said to take it or gave an amount. Null otherwise. A ute tray is roughly 2 m3, a trailer 1.5 m3.',
    ),
  observations: z
    .array(z.string())
    .describe('2 to 6 short statements of what affects the work.'),
  concerns: z
    .array(z.string())
    .describe('Anything that could blow the time out, or that you cannot see. Empty if none.'),
  customerNote: z
    .string()
    .describe(
      'Anything in the note meant for the customer or the job sheet rather than the price — gate codes, dogs, timing, access arrangements. Empty string if none. Do not invent.',
    ),
});

export type SiteAssessment = z.infer<typeof SiteAssessmentSchema>;

export interface AssessmentResult {
  conditions: SiteConditions;
  requestedWork: OptionalTask[];
  statedLabour: LabourAddition[];
  greenWasteM3: number | null;
  observations: string[];
  concerns: string[];
  customerNote: string;
}

function bucketList(family: keyof typeof RATE_CARD.multipliers): string {
  const table = RATE_CARD.multipliers[family] as Record<
    string,
    { label: string; factor: number }
  >;
  return Object.entries(table)
    .map(([key, { label, factor }]) => `  - "${key}": ${label} (×${factor})`)
    .join('\n');
}

const SYSTEM_PROMPT = `You are helping a New South Wales landscaper quote a residential lawn job. You will get photos of the property, a short note from the landscaper, or both.

You do NOT estimate prices, areas or lengths. The block has already been measured from the land title plan. Your job is to classify the site conditions and to repeat back any extra work the landscaper asked for.

## The note outranks the photos

The note is written by the person who will do the job, often standing in the yard. Where the note and the photos disagree, believe the note. If the note says "this one's overgrown", grassHeight is overgrown regardless of what the photo seems to show.

The note may be informal, dictated, or contain typos. Read it for intent.

## Conditions — pick exactly one bucket each

The multiplier is how much that bucket changes labour time, so the choice matters.

grassHeight:
${bucketList('grassHeight')}

obstacleDensity — things that must be mown or trimmed around:
${bucketList('obstacleDensity')}

slope:
${bucketList('slope')}

access — how gear gets from the street to the work:
${bucketList('access')}

## Extra work

The standard job is mowing, edging and a blow down. If the landscaper asks for anything else, record it:

- Asked for with NO time given → put the task in requestedWork ("wants the beds weeded" → ["weed"]).
- Asked for WITH a time given → put it in statedLabour instead ("weeding, about an hour" → 60 minutes). Never put the same work in both; that charges the customer twice.
- Told to take the clippings away → set greenWasteM3.

Available extra tasks: "bedTidy" (garden bed edging and tidy), "weed" (weeding beds), "hedge" (hedge and shrub trimming).

## Confidence

- Stated by the landscaper: near certain.
- Clearly visible in a good photo: high.
- Inferred from a partial or poor photo: moderate.
- Neither stated nor visible, so you defaulted to typical: low. Say so in concerns.

A note alone, with no photos, should not score above about 0.8 — it tells you what the landscaper thought to mention and nothing else.

Be conservative. Under-quoting costs the operator money.`;

export async function assessSite(
  photos: PhotoInput[],
  note: string,
): Promise<AssessmentResult> {
  const trimmedNote = note.trim();
  if (photos.length === 0 && trimmedNote === '') {
    throw new SiteAssessmentError('Add a photo or write a note');
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new SiteAssessmentError(
      'Assessment needs an ANTHROPIC_API_KEY. Add one to .env.local and restart.',
    );
  }

  const client = new Anthropic();

  const instruction = [
    photos.length > 0
      ? `Assess these ${photos.length} photo${photos.length === 1 ? '' : 's'} of the property.`
      : 'There are no photos for this job — work from the note alone.',
    trimmedNote
      ? `\n\nThe landscaper's note:\n"""\n${trimmedNote}\n"""`
      : '\n\nThe landscaper did not leave a note.',
  ].join('');

  let response;
  try {
    response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...photos.map((photo) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: photo.mediaType,
                data: photo.data,
              },
            })),
            { type: 'text' as const, text: instruction },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(SiteAssessmentSchema) },
    });
  } catch (cause) {
    if (cause instanceof Anthropic.AuthenticationError) {
      throw new SiteAssessmentError('The ANTHROPIC_API_KEY was rejected.');
    }
    if (cause instanceof Anthropic.RateLimitError) {
      throw new SiteAssessmentError('Rate limited — try again in a moment.');
    }
    if (cause instanceof Anthropic.APIError) {
      throw new SiteAssessmentError(`Assessment failed (${cause.status}).`);
    }
    throw cause;
  }

  if (response.stop_reason === 'refusal') {
    throw new SiteAssessmentError(
      'The model declined to assess this. Try different photos or wording.',
    );
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new SiteAssessmentError(
      `Could not read the assessment back (stop reason: ${response.stop_reason}).`,
    );
  }

  // Belt and braces on the double-charge rule the prompt sets out: if a task
  // shows up in both lists, the stated time wins and the task is dropped.
  const statedText = parsed.statedLabour
    .map((entry) => entry.description.toLowerCase())
    .join(' ');
  const requestedWork = parsed.requestedWork.filter((task) => {
    const word = { bedTidy: 'bed', weed: 'weed', hedge: 'hedge' }[task];
    return !statedText.includes(word);
  });

  return {
    conditions: {
      grassHeight: parsed.grassHeight,
      obstacleDensity: parsed.obstacleDensity,
      slope: parsed.slope,
      access: parsed.access,
      confidence: parsed.confidence,
    },
    requestedWork,
    statedLabour: parsed.statedLabour,
    greenWasteM3: parsed.greenWasteM3,
    observations: parsed.observations,
    concerns: parsed.concerns,
    customerNote: parsed.customerNote,
  };
}
