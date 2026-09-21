import { z } from 'zod';

const nonNegative = z.coerce.number().min(0).default(0);

export const quoteRequestSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, 'Customer name is required'),
    email: z.union([z.string().trim().email(), z.literal('')]).optional(),
    phone: z.string().trim().optional(),
  }),
  property: z.object({
    addressLine: z.string().trim().min(1, 'Street address is required'),
    suburb: z.string().trim().min(1, 'Suburb is required'),
    state: z.string().trim().default('NSW'),
    postcode: z.string().trim().default(''),
  }),
  measurements: z.object({
    lawnAreaM2: nonNegative,
    edgeMetres: nonNegative,
    hardSurfaceM2: nonNegative,
    bedEdgeMetres: nonNegative,
    hedgeMetres: nonNegative,
    weedAreaM2: nonNegative,
    greenWasteM3: nonNegative,
    travelKm: nonNegative,
  }),
  conditions: z.object({
    grassHeight: z.enum(['short', 'normal', 'long', 'overgrown', 'severe']),
    obstacleDensity: z.enum(['none', 'low', 'moderate', 'high']),
    slope: z.enum(['flat', 'gentle', 'moderate', 'steep']),
    access: z.enum(['open', 'standardGate', 'narrowGate', 'stairsOnly']),
    confidence: z.coerce.number().min(0).max(1),
  }),
  packageKeys: z.array(z.enum(['standard', 'fullTidy'])).min(1).optional(),
  extras: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        amount: z.coerce.number(),
      }),
    )
    .optional(),
  // Zod strips unknown keys, so anything the engine accepts MUST be listed
  // here or it vanishes between the form and the PDF. Leaving this out once
  // already produced a quote with an hour of weeding missing off the bill.
  labourAdditions: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        minutes: z.coerce.number().min(0).max(1440),
      }),
    )
    .optional(),
  notes: z.string().trim().optional(),
});

export type QuoteRequestInput = z.input<typeof quoteRequestSchema>;
