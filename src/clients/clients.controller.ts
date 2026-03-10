import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@Body() dto: CreateClientDto, @TenantId() tenantId: string) {
    return this.clientsService.create(dto, tenantId);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.clientsService.findAll(tenantId);
  }

  @Get('generic')
  findGeneric(@TenantId() tenantId: string) {
    return this.clientsService.findGeneric(tenantId);
  }

  @Get('search')
  search(@Query('q') query: string, @TenantId() tenantId: string) {
    return this.clientsService.search(query || '', tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.clientsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @TenantId() tenantId: string,
  ) {
    return this.clientsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.clientsService.remove(id, tenantId);
  }
}
