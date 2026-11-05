import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard, RolesGuard } from './guards';

const secret = process.env.JWT_SECRET ?? '';
if (secret.length < 32) throw new Error('JWT_SECRET ausente ou com menos de 32 caracteres');

@Module({
  imports: [JwtModule.register({ global: true, secret, signOptions: { expiresIn: '15m', algorithm: 'HS256' } })],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, RolesGuard],
  exports: [JwtGuard, RolesGuard],
})
export class AuthModule {}
