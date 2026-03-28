import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, ROLE_HIERARCHY } from '../../common/types/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles specified = public (after JWT guard)
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('No user found in request');
    }

    // Check if user's role is at least as high as any of the required roles
    const userLevel = ROLE_HIERARCHY[user.role] ?? -1;
    const hasRole = requiredRoles.some(
      (role) => userLevel >= ROLE_HIERARCHY[role],
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Role '${user.role}' does not have access. Required: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
