import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AllowBeforePasswordChange } from 'src/common/decorators/allow-before-password-change.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { JwtUserPayload } from './auth.types';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.login(
      payload.username,
      payload.password,
      request.ip,
      payload.businessScope,
    );
  }

  @AllowBeforePasswordChange()
  @Post('logout')
  logout(@CurrentUser() user: JwtUserPayload, @Req() request: Request) {
    return this.authService.logout(user.sub, request.ip);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() payload: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(payload.refreshToken, request.ip);
  }

  @AllowBeforePasswordChange()
  @Get('me')
  me(@CurrentUser() user: JwtUserPayload) {
    return this.authService.me(user.sub);
  }

  @AllowBeforePasswordChange()
  @Post('change-password')
  changePassword(
    @CurrentUser() user: JwtUserPayload,
    @Body() payload: ChangePasswordDto,
    @Req() request: Request,
  ) {
    return this.authService.changePassword(
      user.sub,
      payload.oldPassword,
      payload.newPassword,
      request.ip,
    );
  }
}
