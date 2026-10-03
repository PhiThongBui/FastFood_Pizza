import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/sequelize';
import { ENUMROLE, User } from '@/models';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionValue } from '../constants/permissions.constant';

interface AuthenticatedRequest {
  user?: {
    uid?: number;
    role?: string;
  };
}

const hasAdminPrivileges = (role?: string) =>
  role === ENUMROLE.SUPER_ADMIN.toString() || role === ENUMROLE.ADMIN.toString();

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionValue[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = request.user;
    if (!actor?.uid) throw new ForbiddenException('Authenticated account is required');

    const user = await this.userModel.findByPk(actor.uid, {
      attributes: ['id', 'role', 'isActive', 'permissions'],
    });

    if (!user || !user.dataValues.isActive) {
      throw new ForbiddenException('Account is inactive or not found');
    }

    if (hasAdminPrivileges(user.dataValues.role)) return true;

    if (user.dataValues.role !== ENUMROLE.STAFF) {
      throw new ForbiddenException('Staff role is required');
    }

    const userPermissions = Array.isArray(user.dataValues.permissions) ? user.dataValues.permissions : [];
    const allowed = requiredPermissions.some((permission) => userPermissions.includes(permission));
    if (!allowed) throw new ForbiddenException('Missing required permission');

    return true;
  }
}
