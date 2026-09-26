import type { RequestHandler } from 'express';
import { z } from 'zod';
import { getAuthUser } from '../middleware/requireAuth.js';
import type { AuthService } from '../services/auth.service.js';

/** Request body for POST /api/auth/login, enforced by validateBody before the controller runs. */
export const loginBodySchema = z.object({
  username: z.string().trim().min(1).max(100),
  // bcrypt only uses the first 72 *bytes*; longer passwords are rejected rather
  // than silently truncated. Bytes, not characters: 'é' is 2 bytes in UTF-8.
  password: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value) <= 72, 'must be at most 72 bytes'),
});
type LoginBody = z.infer<typeof loginBodySchema>;

/**
 * HTTP layer for auth: reads the (already validated) request, calls the
 * service, and shapes the response. No business logic lives here.
 */
export function createAuthController(authService: AuthService) {
  /** POST /api/auth/login -> 200 { token, expiresIn, user } */
  const login: RequestHandler = async (req, res) => {
    // Safe cast: validateBody(loginBodySchema) has already parsed req.body.
    const { username, password } = req.body as LoginBody;
    // If login() rejects, Express 5 forwards the error to errorHandler.
    res.json(await authService.login(username, password));
  };

  /** GET /api/auth/me -> 200 { username }. Lets the frontend check a stored session. */
  const me: RequestHandler = (_req, res) => {
    res.json(getAuthUser(res));
  };

  return { login, me };
}
