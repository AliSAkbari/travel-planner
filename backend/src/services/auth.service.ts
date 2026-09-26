import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

/** The authenticated user, as carried in the token's `sub` claim. */
export interface AuthUser {
  username: string;
}

export interface LoginResult {
  token: string;
  /** Token lifetime in seconds, so the client knows when it will expire. */
  expiresIn: number;
  user: AuthUser;
}

export interface AuthService {
  login(username: string, password: string): Promise<LoginResult>;
  verifyToken(token: string): AuthUser;
}

// Same message for a wrong username and a wrong password, so responses don't
// reveal which usernames exist.
const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
const invalidToken = () => new HttpError(401, 'INVALID_TOKEN', 'Token is invalid');

/**
 * Creates the auth service for the configured demo user.
 * A factory (rather than module-level state) so each app instance and each
 * test gets its own service built from its own config.
 */
export function createAuthService(config: Pick<Config, 'jwt' | 'demoUser'>): AuthService {
  const { jwt: jwtConfig, demoUser } = config;

  // Timing-attack defence: for an unknown username we still run bcrypt.compare,
  // against this dummy hash. It uses the same cost factor as the real hash, so
  // both paths do the same amount of work and response time doesn't reveal
  // whether a username exists. Computed once here: at cost 12 it takes ~250 ms.
  const dummyHash = bcrypt.hashSync(
    'dummy-password-that-is-never-accepted',
    bcrypt.getRounds(demoUser.passwordHash),
  );

  async function login(username: string, password: string): Promise<LoginResult> {
    const isKnownUser = username === demoUser.username;
    const passwordMatches = await bcrypt.compare(
      password,
      isKnownUser ? demoUser.passwordHash : dummyHash,
    );
    if (!isKnownUser || !passwordMatches) throw invalidCredentials();

    const token = jwt.sign({}, jwtConfig.secret, {
      algorithm: 'HS256',
      subject: username,
      expiresIn: jwtConfig.expiresInSeconds,
    });
    return { token, expiresIn: jwtConfig.expiresInSeconds, user: { username } };
  }

  function verifyToken(token: string): AuthUser {
    let payload: string | jwt.JwtPayload;
    try {
      // Pinning the algorithm rejects tokens that claim `alg: none` or any
      // other algorithm, instead of trusting the token's own header.
      payload = jwt.verify(token, jwtConfig.secret, { algorithms: ['HS256'] });
    } catch (err) {
      // Expired is reported separately so the client can say "session expired".
      if (err instanceof jwt.TokenExpiredError) {
        throw new HttpError(401, 'TOKEN_EXPIRED', 'Token has expired');
      }
      throw invalidToken();
    }

    // A valid signature only proves we issued it; still check the shape before
    // trusting it. Tokens for any user other than the configured one are
    // rejected, so changing DEMO_USERNAME invalidates old tokens.
    if (typeof payload === 'string' || payload.sub !== demoUser.username) throw invalidToken();

    return { username: payload.sub };
  }

  return { login, verifyToken };
}
