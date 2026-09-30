import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export type UserRole = 'ADMIN' | 'COLLABORATOR' | 'CLIENT';

export interface NeonAuthUser {
  sub: string;
  email: string;
  role: UserRole;
  projects: string[];
  [key: string]: unknown;
}

declare global {
  namespace Express {
    interface Request {
      user?: NeonAuthUser;
    }
  }
}

/**
 * Llave secreta o pública para verificación de tokens Neon Auth.
 * Soporta algoritmos RS256 (llave pública PEM o JWKS) y HS256 (secreto compartido).
 */
const getVerificationKey = (): { key: string; algorithms: jwt.Algorithm[] } => {
  const publicKey = process.env.NEON_AUTH_PUBLIC_KEY;
  if (publicKey) {
    let formattedKey = publicKey;
    if (!formattedKey.includes('-----BEGIN')) {
      formattedKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
    }
    return { key: formattedKey, algorithms: ['RS256'] };
  }

  const secret = process.env.NEON_AUTH_SECRET || process.env.JWT_SECRET || 'antigravity_neon_auth_fallback_secret_2026';
  return { key: secret, algorithms: ['HS256', 'RS256'] };
};

/**
 * Middleware para autenticar tokens JWT de Neon Auth en el encabezado Authorization Bearer.
 * Extrae sub, email, role y lista de proyectos autorizados inyectándolos en req.user.
 */
export function authenticateNeonAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or malformed Authorization Bearer header'
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      error: 'Unauthorized: Empty Bearer token'
    });
    return;
  }

  try {
    const { key, algorithms } = getVerificationKey();
    const decoded = jwt.verify(token, key, { algorithms }) as JwtPayload & {
      role?: string;
      email?: string;
      projects?: string[] | string;
      project_ids?: string[];
      authorized_projects?: string[];
    };

    if (!decoded.sub) {
      res.status(401).json({
        error: 'Unauthorized: JWT payload missing subject (sub)'
      });
      return;
    }

    // Normalizar rol
    const rawRole = (decoded.role || 'COLLABORATOR').toUpperCase();
    const role: UserRole = (rawRole === 'ADMIN' || rawRole === 'CLIENT' || rawRole === 'COLLABORATOR')
      ? rawRole
      : 'COLLABORATOR';

    // Normalizar lista de proyectos autorizados
    let projects: string[] = [];
    if (Array.isArray(decoded.projects)) {
      projects = decoded.projects;
    } else if (Array.isArray(decoded.project_ids)) {
      projects = decoded.project_ids;
    } else if (Array.isArray(decoded.authorized_projects)) {
      projects = decoded.authorized_projects;
    } else if (typeof decoded.projects === 'string') {
      projects = [decoded.projects];
    }

    req.user = {
      ...decoded,
      sub: decoded.sub,
      email: decoded.email || decoded.sub,
      role,
      projects
    };

    next();
  } catch (err: any) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token expired'
      : err.name === 'JsonWebTokenError'
      ? `Invalid token signature: ${err.message}`
      : 'Authentication failed';

    res.status(401).json({
      error: `Unauthorized: ${message}`
    });
  }
}

/**
 * Middleware para restringir el acceso a endpoints según una lista de roles permitidos.
 * Responde 403 Forbidden si el rol no cuenta con privilegios suficientes.
 */
export function requireRole(allowedRoles: UserRole[] | UserRole) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized: Authentication required before role verification'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `FORBIDDEN: Access denied for role '${req.user.role}'. Required role: ${roles.join(', ')}`
      });
      return;
    }

    next();
  };
}

/**
 * Utilidad para generar tokens JWT válidos de Neon Auth (útil para pruebas y seedings).
 */
export function generateNeonAuthToken(
  user: { sub: string; email: string; role: UserRole; projects?: string[] },
  expiresIn: string = '24h'
): string {
  const secret = process.env.NEON_AUTH_SECRET || process.env.JWT_SECRET || 'antigravity_neon_auth_fallback_secret_2026';
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: expiresIn as any
  };

  return jwt.sign(
    {
      sub: user.sub,
      email: user.email,
      role: user.role,
      projects: user.projects || []
    },
    secret,
    options
  );
}
