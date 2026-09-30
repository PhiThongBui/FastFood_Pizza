import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CartPreviewService } from './cart-preview.service';
import { Helper } from '@/utils/helper';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CartService } from '../cart/cart.service';
import { CheckoutCaculateDto } from './dto/checkout.dto';
import { JWTGuard } from '../auth/guards/verifyjwt.guard';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('cart-preview')
export class CartPreviewController {
  constructor(
    private readonly cartPreviewService: CartPreviewService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cartService: CartService

  ) { }

  private withCartCounts<T extends { data?: { items?: Array<{ quantity?: number }> } }>(
    response: T,
  ): T {
    const items = response.data?.items || [];

    if (response.data) {
      const data = response.data as typeof response.data & {
        itemCount: number;
        totalQuantity: number;
      };

      data.itemCount = items.length;
      data.totalQuantity = items.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0,
      );
    }

    return response;
  }

  @Post('/checkout-preview')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Xem trước thanh toán (Checkout Preview)',
    description: 'Tính toán giá trị thanh toán cho các CartItem được chọn'
  })
  @ApiOperation({
    summary: 'Checkout Preview',
    description: `
Yêu cầu xác định giỏ hàng thông qua:

- Authorization: Bearer token (đối với user đã đăng nhập)
- Cookie: sessionId (đối với khách vãng lai)

API sẽ tự động xác định cart tương ứng.
`
  })

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cartItemIds: {
          type: 'array',
          items: { type: 'number' },
          example: [12, 15, 18]
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Preview thành công'
  })
  async getCartDetail(
    @Body('cartItemIds') cartItemIds: number[],
    @Req() req: Request
  ) {
    const sessionId = Helper.getSessionIdFromRequest(req);
    let userId: number | null = null;

    const authBearer = req.headers?.authorization;
    if (authBearer?.startsWith('Bearer ')) {
      try {
        const token = authBearer.substring(7);
        const decoded = this.jwtService.verify(
          token,
          this.configService.get('JWT_SECRET')
        ) as any;
        userId = decoded.uid;
      } catch {
        userId = null;
      }
    }
    const cart = await this.cartService.getCartByContext(
      sessionId,
      userId,
    );

    return this.withCartCounts(await this.cartPreviewService.cartPreview(
      cart.id,
      cartItemIds,
    ));
  }

  @Get('/cart')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Xem giỏ hàng của mình',
  })
  @ApiOperation({
    summary: 'Cart Preview',
    description: `
Yêu cầu xác định giỏ hàng thông qua:

- Authorization: Bearer token (đối với user đã đăng nhập)
- Cookie: sessionId (đối với khách vãng lai)

API sẽ tự động xác định cart tương ứng.
`
  })
  async getCartPreview(
    @Req() req: Request
  ) {
    const sessionId = Helper.getSessionIdFromRequest(req);
    let userId: number | null = null;

    const authBearer = req.headers?.authorization;
    if (authBearer?.startsWith('Bearer ')) {
      try {
        const token = authBearer.substring(7);
        const decoded = this.jwtService.verify(
          token,
          this.configService.get('JWT_SECRET')
        ) as any;
        userId = decoded.uid;
      } catch {
        userId = null;
      }
    }
    const cart = await this.cartService.getCartByContext(
      sessionId,
      userId,
    );

    return this.withCartCounts(await this.cartPreviewService.getUserCartPreview(
      cart.id,
    ));
  }

  @UseGuards(JWTGuard)
  @Post('/checkout-calculate')
  async checkoutCaculate(@Body() dto: CheckoutCaculateDto, @Req() req: Request) {
    try {
      if (dto.addressId && dto.temporaryAddress) {
        throw new BadRequestException('Cannot use both addressId and temporaryAddress at the same time.');
      }
      const sessionId = Helper.getSessionIdFromRequest(req)
      let userId: number | null = null
      const authBearer = req.headers?.authorization
      if (authBearer && authBearer.startsWith('Bearer ')) {
        try {
          const token = authBearer.substring(7)
          const decoded = this.jwtService.verify(token, this.configService.get('JWT_SECRET')) as any
          userId = decoded.uid
        } catch (error: any) {
          userId = null
        }
      }
      if (!userId) {
        throw new BadRequestException('User id not found')
      }

      const cartId = await this.cartService.getCartByContext(sessionId, userId)

      return await this.cartPreviewService.checkoutCaculate(userId, cartId?.dataValues?.id, dto);
    } catch (error: any) {
      console.log(error);
      throw new BadRequestException(error.message)
    }
  }


}
