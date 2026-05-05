import { describe, expect, it } from 'vitest';
import { AppError } from '@/utils/errors';
import { SummarizeSseEventSchema, parseSummarizeSseEvent } from '@/schemas/summarizeSse';
import {
  RecentDocumentsCacheSchema,
  parseRecentDocumentsCache,
} from '@/schemas/recentDocumentsCache';
import {
  SendRequestErrorBodySchema,
  parseSendRequestErrorBody,
  readOptionalDetailFromErrorJson,
} from '@/schemas/sendRequestErrorBody';

describe('SummarizeSseEventSchema', () => {
  it('happy: accepts done event with summary fields', () => {
    const r = SummarizeSseEventSchema.safeParse({
      type: 'done',
      summary: 'S',
      pdf_text: 'P',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe('done');
      expect(r.data.summary).toBe('S');
    }
  });

  it('sad: rejects value without string type', () => {
    const r = SummarizeSseEventSchema.safeParse({ type: 1 });
    expect(r.success).toBe(false);
  });
});

describe('parseSummarizeSseEvent', () => {
  it('throws validation AppError when shape is invalid', () => {
    expect(() => parseSummarizeSseEvent(null)).toThrow(AppError);
    try {
      parseSummarizeSseEvent(null);
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(AppError);
      if (e instanceof AppError) expect(e.category).toBe('validation');
    }
  });
});

describe('RecentDocumentsCacheSchema', () => {
  it('happy: accepts mixed string and object entries', () => {
    const r = RecentDocumentsCacheSchema.safeParse(['a.pdf', { id: '1', name: 'B' }]);
    expect(r.success).toBe(true);
  });

  it('sad: rejects non-array root', () => {
    const r = RecentDocumentsCacheSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe('parseRecentDocumentsCache', () => {
  it('normalizes string and object entries (max 5)', () => {
    const out = parseRecentDocumentsCache(['a.pdf', { id: '1', name: 'Named' }, { id: '2' }]);
    expect(out).toEqual([
      { id: 'a.pdf', name: 'a.pdf' },
      { id: '1', name: 'Named' },
      { id: '2', name: '2' },
    ]);
  });

  it('throws validation AppError for invalid entries', () => {
    expect(() => parseRecentDocumentsCache([{ id: 1 }])).toThrow(AppError);
  });
});

describe('SendRequestErrorBodySchema', () => {
  it('happy: accepts detail and extra keys (passthrough)', () => {
    const r = SendRequestErrorBodySchema.safeParse({
      detail: [{ msg: 'x' }],
      trace: 'abc',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.detail).toEqual([{ msg: 'x' }]);
      expect(r.data.trace).toBe('abc');
    }
  });

  it('sad: rejects non-object root for schema direct parse', () => {
    const r = SendRequestErrorBodySchema.safeParse('fail');
    expect(r.success).toBe(false);
  });
});

describe('parseSendRequestErrorBody / readOptionalDetailFromErrorJson', () => {
  it('returns null for non-plain-object payloads', () => {
    expect(parseSendRequestErrorBody(null)).toBeNull();
    expect(parseSendRequestErrorBody([])).toBeNull();
    expect(readOptionalDetailFromErrorJson([])).toBeUndefined();
  });

  it('throws AppError when value is object but not a plain record envelope', () => {
    expect(() => parseSendRequestErrorBody(new Map())).toThrow(AppError);
  });

  it('reads detail from a plain API error object', () => {
    expect(readOptionalDetailFromErrorJson({ detail: 'x' })).toBe('x');
  });
});
