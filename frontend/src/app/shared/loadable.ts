import { HttpErrorResponse } from '@angular/common/http';
import { catchError, map, of, type OperatorFunction, startWith } from 'rxjs';
import type { ApiErrorBody } from '../core/api/api.models';

/**
 * The state of one request, as a single value a template can @switch on.
 * One type for every card means loading and error states are handled the
 * same way everywhere, and the "error" case can't be forgotten.
 */
export type Loadable<T> =
  { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; message: string };

export const LOADING = { status: 'loading' } as const;

/** Turns an HTTP observable into a stream of Loadable states: loading, then ok or error. */
export function toLoadable<T>(): OperatorFunction<T, Loadable<T>> {
  return (source) =>
    source.pipe(
      map((data): Loadable<T> => ({ status: 'ok', data })),
      startWith<Loadable<T>>(LOADING),
      catchError((error: unknown) =>
        of<Loadable<T>>({ status: 'error', message: errorMessage(error) }),
      ),
    );
}

/** A user-facing message for a failed request. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return "Can't reach the server. Check your connection and try again.";
    // Our API always answers { error: { message } }; prefer its wording.
    const body = error.error as Partial<ApiErrorBody> | null;
    if (body?.error?.message) return body.error.message;
  }
  return 'Something went wrong. Please try again.';
}
