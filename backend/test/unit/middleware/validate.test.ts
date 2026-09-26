import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';
import { validateBody } from '../../../src/middleware/validate.js';

const schema = z.object({ name: z.string().trim().min(1) });

describe('validateBody', () => {
  it('replaces req.body with the parsed result and calls next', () => {
    const req = { body: { name: '  Ada  ', extra: 'dropped' } } as Request;
    const next = vi.fn();

    validateBody(schema)(req, {} as Response, next);

    expect(req.body).toEqual({ name: 'Ada' });
    expect(next).toHaveBeenCalledWith();
  });

  it('throws a ZodError for an invalid body', () => {
    const req = { body: { name: '' } } as Request;
    expect(() => validateBody(schema)(req, {} as Response, vi.fn())).toThrow(ZodError);
  });

  it('throws a ZodError when there is no body at all', () => {
    // Express 5 leaves req.body undefined when no body was parsed.
    const req = { body: undefined } as Request;
    expect(() => validateBody(schema)(req, {} as Response, vi.fn())).toThrow(ZodError);
  });
});
