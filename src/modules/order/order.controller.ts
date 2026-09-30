import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { JWTGuard } from '../auth/guards/verifyjwt.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RolesGuard } from '@/common/guards/role.guards';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ORDER_PERMISSIONS } from '@/common/constants/permissions.constant';
import { ENUMROLE } from '@/models';
import { AdminOrderDateRangeQueryDto, AdminOrderLimitQueryDto, AdminOrderListQueryDto, AdminOrderRevenueQueryDto } from './dto/admin-order-statistics.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.VIEW)
  @Get('admin/orders')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get admin order list' })
  getAdminOrders(@Query() query: AdminOrderListQueryDto) {
    return this.orderService.getAdminOrders(query);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATUS_UPDATE)
  @Patch('admin/orders/:id/status')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update admin order status' })
  updateAdminOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateAdminOrderStatus(id, dto);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATUS_UPDATE)
  @Patch('admin/orders/:id/cancel')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel order by admin' })
  cancelAdminOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancelAdminOrder(id, dto);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATISTICS_VIEW)
  @Get('admin/statistics/overview')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get admin order statistics overview' })
  getAdminOrderOverview(@Query() query: AdminOrderDateRangeQueryDto) {
    return this.orderService.getAdminOrderOverview(query);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATISTICS_VIEW)
  @Get('admin/statistics/revenue')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get admin revenue chart statistics' })
  getAdminRevenueStatistics(@Query() query: AdminOrderRevenueQueryDto) {
    return this.orderService.getAdminRevenueStatistics(query);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATISTICS_VIEW)
  @Get('admin/statistics/status')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get admin order status statistics' })
  getAdminOrderStatusStatistics(@Query() query: AdminOrderDateRangeQueryDto) {
    return this.orderService.getAdminOrderStatusStatistics(query);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATISTICS_VIEW)
  @Get('admin/statistics/payment')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get admin payment statistics' })
  getAdminPaymentStatistics(@Query() query: AdminOrderDateRangeQueryDto) {
    return this.orderService.getAdminPaymentStatistics(query);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATISTICS_VIEW)
  @Get('admin/statistics/top-products')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get admin top selling order items' })
  getAdminTopProducts(@Query() query: AdminOrderLimitQueryDto) {
    return this.orderService.getAdminTopProducts(query);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(ORDER_PERMISSIONS.STATISTICS_VIEW)
  @Get('admin/statistics/recent-orders')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get admin recent orders' })
  getAdminRecentOrders(@Query() query: AdminOrderLimitQueryDto) {
    return this.orderService.getAdminRecentOrders(query);
  }

  @UseGuards(JWTGuard)
  @Get('my-orders')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy danh sách đơn hàng của tôi' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm theo mã đơn hoặc tên món/combo' })
  @ApiQuery({ name: 'minPrice', required: false, description: 'Lọc tổng tiền từ' })
  @ApiQuery({ name: 'maxPrice', required: false, description: 'Lọc tổng tiền đến' })
  @ApiQuery({ name: 'orderStatus', required: false, description: 'Trạng thái đơn hàng' })
  @ApiQuery({ name: 'paymentStatus', required: false, description: 'Trạng thái thanh toán' })
  getMyOrders(@Req() req: any, @Query() query: Record<string, string>) {
    return this.orderService.getMyOrders(Number(req.user?.uid), query);
  }

  @UseGuards(JWTGuard)
  @Patch('my-orders/:id/cancel')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel my order' })
  cancelMyOrder(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancelMyOrder(Number(req.user?.uid), id, dto);
  }

  @UseGuards(JWTGuard)
  @Patch('my-orders/:id/pay-now')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Switch my COD order to SePay and return payment info' })
  payMyOrderNow(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.payMyOrderNow(Number(req.user?.uid), id);
  }
}
