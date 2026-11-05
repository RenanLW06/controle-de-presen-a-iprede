import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Response } from 'express';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login') @HttpCode(204)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const token = await this.auth.login(dto.email.toLowerCase(), dto.password);
    res.cookie('access_token', token, {
      httpOnly: true, sameSite: 'strict', path: '/',
      secure: process.env.COOKIE_SECURE !== 'false', maxAge: 15 * 60 * 1000,
    });
  }

  @Post('logout') @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) { res.clearCookie('access_token', { path: '/' }); }
}
