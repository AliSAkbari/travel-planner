import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler, notFound, toErrorResponse } from '../../../src/middleware/errorHandler.js';
import { HttpError } from '../../../src/utils/httpError.js';

/** Builds an Error shaped like the ones body-parser (express.json) produces. */
function bodyParserError(type: string): Error {
  return Object.assign(new Error('body-parser failure'), { type });
}

describe('toErrorResponse', () => {
  it('uses the status, code and message of an HttpError', () => {
    expect(toErrorResponse(new HttpError(404, 'CITY_NOT_FOUND', 'Unknown city'))).toEqual({
      status: 404,
      body: { error: { code: 'CITY_NOT_FOUND', message: 'Unknown city' } },
    });
  });

  it('includes HttpError details only when present', () => {
    const { body } = toErrorResponse(new HttpError(400, 'BAD', 'Bad', { field: 'x' }));
    expect(body.error.details).toEqual({ field: 'x' });
  });

  it('maps a ZodError to 400 with one entry per issue', () => {
    const result = z.object({ username: z.string() }).safeParse({ username: 42 });
    expect(result.success).toBe(false);

    const { status, body } = toErrorResponse(result.error);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([{ path: 'username', message: expect.any(String) }]);
  });

  it('maps malformed JSON to 400 INVALID_JSON', () => {
    expect(toErrorResponse(bodyParserError('entity.parse.failed'))).toMatchObject({
      status: 400,
      body: { error: { code: 'INVALID_JSON' } },
    });
  });

  it('maps an oversized body to 413 PAYLOAD_TOO_LARGE', () => {
    expect(toErrorResponse(bodyParserError('entity.too.large'))).toMatchObject({
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE' } },
    });
  });

  it('maps unknown errors to a generic 500 without leaking the original message', () => {
    const { status, body } = toErrorResponse(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  it('handles non-Error throwables', () => {
    expect(toErrorResponse('a string was thrown').status).toBe(500);
  });
});

describe('errorHandler', () => {
  function mockResponse(headersSent = false) {
    const res = { headersSent, status: vi.fn(), json: vi.fn(), set: vi.fn() };
    res.status.mockReturnValue(res); // allow res.status(...).json(...) chaining
    return res;
  }
  const req = {} as Request;

  it('sends the mapped status and JSON body', () => {
    const res = mockResponse();
    const next = vi.fn();

    errorHandler(new HttpError(404, 'NOT_FOUND', 'Nope'), req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'Nope' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('adds WWW-Authenticate: Bearer to 401 responses only', () => {
    const unauthorized = mockResponse();
    errorHandler(
      new HttpError(401, 'INVALID_TOKEN', 'x'),
      req,
      unauthorized as unknown as Response,
      vi.fn(),
    );
    expect(unauthorized.set).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');

    const notFoundRes = mockResponse();
    errorHandler(
      new HttpError(404, 'NOT_FOUND', 'x'),
      req,
      notFoundRes as unknown as Response,
      vi.fn(),
    );
    expect(notFoundRes.set).not.toHaveBeenCalled();
  });

  it('logs 500s server-side', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');

    errorHandler(err, req, mockResponse() as unknown as Response, vi.fn());

    expect(log).toHaveBeenCalledWith(err);
  });

  it('does not log client errors', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(
      new HttpError(400, 'BAD', 'Bad'),
      req,
      mockResponse() as unknown as Response,
      vi.fn(),
    );

    expect(log).not.toHaveBeenCalled();
  });

  it('delegates to Express when headers were already sent', () => {
    const res = mockResponse(true);
    const next = vi.fn();
    const err = new Error('mid-stream failure');

    errorHandler(err, req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('notFound', () => {
  it('forwards a 404 HttpError', () => {
    const next = vi.fn();

    notFound({} as Request, {} as Response, next);

    const err: unknown = next.mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
