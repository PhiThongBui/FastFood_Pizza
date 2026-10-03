import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ENUMROLE } from '@/models';
import { CART_ADD_ON_SETTING_PERMISSIONS } from '@/common/constants/permissions.constant';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { RolesGuard } from '@/common/guards/role.guards';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JWTGuard } from '../auth/guards/verifyjwt.guard';
import { CartAddOnSettingService } from './cart-add-on-setting.service';
import { CreateCartAddOnCategorySettingDto } from './dto/create-cart-add-on-category-setting.dto';
import { UpdateCartAddOnCategorySettingDto } from './dto/update-cart-add-on-category-setting.dto';
import { CartAddOnProductsQueryDto } from './dto/cart-add-on-products-query.dto';
import { CreateCartAddOnProductSettingDto } from './dto/create-cart-add-on-product-setting.dto';
import { UpdateCartAddOnProductSettingDto } from './dto/update-cart-add-on-product-setting.dto';

@Controller('cart-add-on-settings')
export class CartAddOnSettingController {
  constructor(private readonly cartAddOnSettingService: CartAddOnSettingService) {}

  @Get('products')
  @ApiOperation({ summary: 'Get cart add-on products for cart sidebar' })
  getAddOnProducts(@Query() query: CartAddOnProductsQueryDto) {
    return this.cartAddOnSettingService.getAddOnProducts(query);
  }

  @Get('admin/categories')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.VIEW)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get cart add-on category settings' })
  getAdminSettings() {
    return this.cartAddOnSettingService.getAdminSettings();
  }

  @Post('admin/categories')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.UPDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create cart add-on category setting' })
  createSetting(@Body() dto: CreateCartAddOnCategorySettingDto) {
    return this.cartAddOnSettingService.createSetting(dto);
  }

  @Patch('admin/categories/:id')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.UPDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update cart add-on category setting' })
  updateSetting(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCartAddOnCategorySettingDto,
  ) {
    return this.cartAddOnSettingService.updateSetting(id, dto);
  }

  @Delete('admin/categories/:id')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.UPDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete cart add-on category setting' })
  deleteSetting(@Param('id', ParseIntPipe) id: number) {
    return this.cartAddOnSettingService.deleteSetting(id);
  }

  @Get('admin/products')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.VIEW)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get cart add-on product settings' })
  getAdminProductSettings() {
    return this.cartAddOnSettingService.getAdminProductSettings();
  }

  @Post('admin/products')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.UPDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create cart add-on product setting' })
  createProductSetting(@Body() dto: CreateCartAddOnProductSettingDto) {
    return this.cartAddOnSettingService.createProductSetting(dto);
  }

  @Patch('admin/products/:id')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.UPDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update cart add-on product setting' })
  updateProductSetting(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCartAddOnProductSettingDto,
  ) {
    return this.cartAddOnSettingService.updateProductSetting(id, dto);
  }

  @Delete('admin/products/:id')
  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(CART_ADD_ON_SETTING_PERMISSIONS.UPDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete cart add-on product setting' })
  deleteProductSetting(@Param('id', ParseIntPipe) id: number) {
    return this.cartAddOnSettingService.deleteProductSetting(id);
  }
}
