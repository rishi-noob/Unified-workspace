import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/types/role.enum';

@ApiTags('Departments')
@ApiBearerAuth()
@Controller('api/v1/departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly deptService: DepartmentsService) {}

  @Get()
  findAll() {
    return this.deptService.findAll();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() body: { name: string; slug: string; emailAlias?: string }) {
    return this.deptService.create(body);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() body: Partial<{ name: string; emailAlias: string; isActive: boolean }>) {
    return this.deptService.update(id, body);
  }
}
