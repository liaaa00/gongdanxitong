import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Department, DispatchedOrder, Role, User, UserRole } from 'src/entities';
import { TeamUsersController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserRole, Role, Department, DispatchedOrder])],
  controllers: [UsersController, TeamUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
