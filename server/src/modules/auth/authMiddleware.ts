import { Request, Response, NextFunction } from 'express';
import { Role, ApiErrorCode } from '@shopright/shared-types';
import { AppError } from '../../middleware/errorHandler.js';
import { verifyAccessToken, JwtUserPayload } from './tokenService.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}

/**
 * Authentication middleware verifying Bearer JWT (API Doc §1 & Security Doc §2).
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(
      401,
      ApiErrorCode.UNAUTHORIZED,
      'Authentication required. Please provide a valid Bearer token.'
    );
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err: unknown) {
    throw new AppError(
      401,
      ApiErrorCode.UNAUTHORIZED,
      'Invalid or expired access token.'
    );
  }
}

/**
 * Role-based guard middleware (Security Doc §2).
 * Enforces role requirement at the route layer.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(
        401,
        ApiErrorCode.UNAUTHORIZED,
        'Authentication required.'
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        403,
        ApiErrorCode.FORBIDDEN_ROLE,
        `Role "${req.user.role}" is not permitted to access this endpoint.`
      );
    }

    next();
  };
}

/**
 * Resource ownership validator helper (Security Doc §2).
 * Confirms that authenticated user either owns the resource or is an ADMIN.
 */
export function verifyOwnership(
  authenticatedUserId: string,
  resourceOwnerId: string,
  userRole?: Role
): void {
  if (userRole === Role.ADMIN) return; // Admin override permitted where designated
  if (authenticatedUserId !== resourceOwnerId) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_RESOURCE,
      'You do not have permission to access or modify this resource.'
    );
  }
}
