import { z } from 'zod';
import { parseOrValidationAppError } from './zodValidation';

export const SummarizeSseEventSchema = z.object({
  type: z.string(),
  token: z.string().optional(),
  summary: z.string().optional(),
  pdf_text: z.string().optional(),
  detail: z.string().optional(),
});

export type SummarizeSseEvent = z.infer<typeof SummarizeSseEventSchema>;

export function parseSummarizeSseEvent(raw: unknown): SummarizeSseEvent {
  return parseOrValidationAppError(SummarizeSseEventSchema, raw, 'summarize.sse.event');
}
