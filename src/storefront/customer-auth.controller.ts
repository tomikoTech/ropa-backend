import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator.js';
import { CustomerAuthGuard } from './guards/customer-auth.guard.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerRegisterDto } from './dto/customer-register.dto.js';
import { CustomerLoginDto } from './dto/customer-login.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';
import { EcommerceCustomer } from './entities/ecommerce-customer.entity.js';

@ApiTags('Storefront - Customer Auth')
@Controller('storefront/:tenantSlug/auth')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo cliente e-commerce' })
  register(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: CustomerRegisterDto,
  ) {
    return this.customerAuthService.register(tenantSlug, dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login de cliente e-commerce' })
  login(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: CustomerLoginDto,
  ) {
    return this.customerAuthService.login(tenantSlug, dto);
  }

  @Public()
  @Post('google')
  @ApiOperation({ summary: 'Login/registro con Google' })
  googleLogin(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: GoogleLoginDto,
  ) {
    return this.customerAuthService.googleLogin(tenantSlug, dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refrescar access token del cliente' })
  refresh(
    @Param('tenantSlug') tenantSlug: string,
    @Body('refreshToken') refreshToken: string,
  ) {
    return this.customerAuthService.refreshToken(tenantSlug, refreshToken);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del cliente autenticado' })
  getProfile(@CurrentCustomer() customer: EcommerceCustomer) {
    return this.customerAuthService.getProfile(customer.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar perfil del cliente' })
  updateProfile(
    @CurrentCustomer() customer: EcommerceCustomer,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.customerAuthService.updateProfile(customer.id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener pedidos del cliente autenticado' })
  getMyOrders(
    @CurrentCustomer() customer: EcommerceCustomer,
    @Param('tenantSlug') tenantSlug: string,
  ) {
    return this.customerAuthService.getMyOrders(customer.id, tenantSlug);
  }
}
