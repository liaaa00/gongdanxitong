import { Body, Controller, Get, Post } from '@nestjs/common';
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
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload.username, payload.password);
  }

  @Post('logout')
  logout() {
    return this.authService.logout();
  }

  @Public()
  @Post('refresh')
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refresh(payload.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: JwtUserPayload) {
    return this.authService.me(user.sub);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: JwtUserPayload,
    @Body() payload: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.sub,
      payload.oldPassword,
      payload.newPassword,
    );
  }
}
