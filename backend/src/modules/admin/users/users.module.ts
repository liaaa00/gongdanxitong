import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Department, DispatchedOrder, ModuleHandler, Role, User, UserRole } from 'src/entities';
import { TeamUsersController, UsersController } from './users.controller';
import { UserHandoverService } from './user-handover.service';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserRole, Role, Department, DispatchedOrder, ModuleHandler])],
  controllers: [UsersController, TeamUsersController],
  providers: [UsersService, UserHandoverService],
  exports: [UsersService, UserHandoverService],
})
export class UsersModule {}
