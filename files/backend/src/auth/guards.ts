import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthedRequest, Role } from './auth.types';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

/** Autenticação: valida o JWT do cookie httpOnly. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException();
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; role: Role }>(token);
      req.user = { id: p.sub, role: p.role };
      return true;
    } catch { throw new UnauthorizedException(); }
  }
}

/** Autorização por papel na rota. O escopo por sala é imposto separadamente, pelo RLS. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!roles?.length || !roles.includes(req.user.role)) throw new ForbiddenException();   // negar por padrão
    return true;
  }
}
