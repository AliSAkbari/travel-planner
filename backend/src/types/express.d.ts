import type { AuthUser } from '../services/auth.service.js';

// Declaration merging: tells TypeScript that res.locals may carry the
// authenticated user, which requireAuth sets after verifying the token.
declare global {
  namespace Express {
    interface Locals {
      user?: AuthUser;
    }
  }
}
