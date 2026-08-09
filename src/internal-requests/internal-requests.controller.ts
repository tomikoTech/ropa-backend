import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';
import { InternalRequestStatus } from './entities/internal-request.entity.js';
import { InternalRequestsService } from './internal-requests.service.js';

class RequestItemDto {
  @IsUUID() variantId: string;
  @IsInt() @Min(1) quantity: number;
}
class CreateRequestDto {
  @IsUUID() destinationWarehouseId: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequestItemDto)
  items: RequestItemDto[];
}
class PrepareItemDto {
  @IsUUID() itemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsArray() @IsString({ each: true }) barcodes?: string[];
}
class PrepareRequestDto {
  @IsUUID() sourceWarehouseId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrepareItemDto)
  items: PrepareItemDto[];
}
class RemitItemDto {
  @IsUUID() itemId: string;
  @IsInt() @Min(1) quantity: number;
}
class RemitRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RemitItemDto)
  items: RemitItemDto[];
}
class PrintRequestDto {
  @IsOptional() @IsBoolean() reprint?: boolean;
}

@ApiTags('Solicitudes internas')
@ApiBearerAuth()
@Controller('internal-requests')
export class InternalRequestsController {
  constructor(private readonly service: InternalRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Cola de solicitudes SO-' })
  findAll(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Query('status') status?: InternalRequestStatus,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.findAll(tenantId, userId, status, warehouseId);
  }
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.findOne(id, tenantId);
  }
  @Post()
  @ApiOperation({ summary: 'Solicitar mercancía desde un punto' })
  create(
    @Body() dto: CreateRequestDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.create(dto, userId, tenantId);
  }
  @Post(':id/prepare')
  prepare(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrepareRequestDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.prepare(id, dto, userId, tenantId);
  }
  @Post(':id/remit')
  remit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemitRequestDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.remit(id, dto.items, userId, tenantId);
  }
  @Post(':id/receive')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.receive(id, userId, tenantId);
  }
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.close(
      id,
      InternalRequestStatus.CANCELLED,
      userId,
      tenantId,
    );
  }
  @Post(':id/return')
  returnRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.close(
      id,
      InternalRequestStatus.RETURNED,
      userId,
      tenantId,
    );
  }
  @Post(':id/print')
  print(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrintRequestDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.print(id, dto.reprint ?? false, tenantId);
  }
}
