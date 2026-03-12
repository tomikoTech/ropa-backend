import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { TenantsService } from './tenants.service.js';
import { OnboardStoreDto } from './dto/onboard-store.dto.js';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('onboard')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Onboarding: crear tienda completa (tenant + admin + warehouse + settings)' })
  onboardStore(@Body() dto: OnboardStoreDto) {
    return this.tenantsService.onboardStore(dto);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() body: { name: string; slug: string }) {
    return this.tenantsService.create(body);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() body: Partial<{ name: string; slug: string; isActive: boolean }>) {
    return this.tenantsService.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }
}
