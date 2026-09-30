import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { CartItemService } from './cart-item.service';
import { CreateCartItemDto } from './dto/cart-item.dto';
import { Response, Request } from 'express';
import { Helper } from '@/utils/helper';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JWTGuard } from '../auth/guards/verifyjwt.guard';
import { actionUpdateCartItem } from './types/cartItem.type';
import { CartService } from '../cart/cart.service';
import { Sequelize } from 'sequelize-typescript';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.ts';
interface AddToCartParams extends CreateCartItemDto {
  userId?: number;
  sessionId?: string;
}
@Controller('cart-item')
export class CartItemController {
  constructor(
    private readonly cartItemService: CartItemService,
    private readonly cartService: CartService,
    private readonly JWTservice: JwtService,
    private readonly configService: ConfigService,
    private readonly transaction: Sequelize
  ) { }

  @UseGuards(JWTGuard)
  @Post('/addtocart')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Thêm sản phẩm vào giỏ hàng',
    description: `
API hỗ trợ **3 loại thao tác chính**:

---

### 🔹 1. Mua món lẻ (Single Product)
Bắt buộc:
- productId
- productVariantId
- quantity

Tuỳ chọn:
- singleProductOptions: danh sách topping / nguyên liệu

---

### 🔹 2. Mua combo (Tuỳ chỉnh - Customize)
Bắt buộc:
- comboId
- quantity
- comboOptions (Danh sách các món khách chọn cụ thể)

---

### 🔹 3. Mua combo (Thêm nhanh - Quick Add)
Bắt buộc:
- comboId
- quantity

**Lưu ý:** Không truyền \`comboOptions\`. Hệ thống sẽ tự động lấy danh sách món mặc định được cấu hình trong Combo.
`
  })
  @ApiBody({
    type: CreateCartItemDto,
    examples: {

      'single-no-topping': {
        summary: '1. Món lẻ - Không topping',
        description: 'Mua 1 Pizza Margherita size M',
        value: {
          productId: 1,
          productVariantId: 5,
          quantity: 1
        }
      },

      'single-with-topping': {
        summary: '2. Món lẻ - Có topping',
        description: 'Mua 2 Pizza Pepperoni size L, thêm phô mai, bớt hành',
        value: {
          productId: 2,
          productVariantId: 8,
          quantity: 1,
          singleProductOptions: [
            {
              ingredientId: 1,
              quantity: 1,
              type: 'ADD'
            },
            {
              ingredientId: 4,
              quantity: 1,
              type: 'REMOVE'
            }
          ]
        }
      },

      'combo-customize': {
        summary: '3. Combo - Có customize (User chọn món)',
        description: 'Combo Gia Đình, Khách đổi sang Pizza Hải Sản và thêm topping',
        value: {
          comboId: 2,
          quantity: 1,
          comboOptions: [
            {
              comboItemId: 4,
              slotIndex: 0,
              productId: 3,
              productVariantId: 15,
              ingredients: [
                {
                  ingredientId: 1,
                  quantity: 1,
                  type: 'ADD'
                }
              ]
            },
            {
              comboItemId: 5,
              slotIndex: 0,
              productId: 4,
              productVariantId: 23
            }
          ]
        }
      },

      // 🔥 TRƯỜNG HỢP MỚI BẠN CẦN Ở ĐÂY
      'combo-quick-add': {
        summary: '4. Combo - Thêm nhanh (Mặc định)',
        description: 'Chỉ gửi comboId. Hệ thống tự lấy các món mặc định (VD: Combo Pizza Bò + Coke -> Tự thêm 1 Pizza Bò, 1 Coke)',
        value: {
          comboId: 1,
          quantity: 1
          // Không gửi comboOptions
        }
      }
    }
  })

  @ApiResponse({
    status: 201,
    description: 'Thêm vào giỏ hàng thành công',
    schema: {
      example: {
        message: 'Thêm vào giỏ hàng thành công!',
        data: {
          id: 123,
          cartId: 1,
          productId: 3,
          productVariantId: 5,
          quantity: 1,
          createdAt: '2025-12-16T04:17:35.592Z'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ',
    schema: {
      example: {
        statusCode: 400,
        message: 'Thiếu thông tin sản phẩm!',
        error: 'Bad Gateway'
      }
    }
  })
  async addToCart(
    @Body() dataAdd: CreateCartItemDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { uid: number; role: string }).uid;

    return await this.cartItemService.addToCart({
      ...dataAdd,
      userId,
    } as AddToCartParams);
  }

  @Patch('/:cartItemId/quantity')
  async updateQuantity(
    @Param('cartItemId') cartItemId: number,
    @Body('action') action: string
  ) {
    return await this.cartItemService.increOrDecreQuantity(cartItemId, action as actionUpdateCartItem)
  }

  @Delete('/:cartItemId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Xoá sản phẩm khỏi giỏ hàng',
    description: 'Xoá một item khỏi giỏ hàng dựa trên cartItemId. Hỗ trợ cả user đã đăng nhập và guest.'
  })
  @ApiParam({
    name: 'cartItemId',
    description: 'ID của item trong giỏ hàng',
    required: true,
    type: Number
  })
  async deleteCartItem(
    @Param('cartItemId') cartItemId: number,
    @Req() req: Request,
    @Res({ passthrough: true }) _res: Response
  ) {
    const sessionId = Helper.getSessionIdFromRequest(req);
    let userId: number | null = null;

    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = this.JWTservice.verify(
          token,
          this.configService.get('JWT_SECRET')
        ) as any;
        userId = decoded.uid;
      } catch (error: any) {
        userId = null;
      }
    }

    return await this.cartItemService.deleteCartItem(cartItemId, userId, sessionId)
  }

  @Get('/mergecart')
  @UseGuards(JWTGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Đồng bộ giỏ hàng từ guest sang user',
    description: `
**Mục đích:** Khi user login, hợp nhất giỏ hàng khách (guest cart) vào giỏ hàng user.

**Quy trình xử lý:**

**1. Món trùng khớp (MERGE)**
- Nếu item đã tồn tại trong giỏ user → Cộng dồn số lượng
- Với món lẻ: Cộng dồn cả số lượng topping
- Sau đó xóa item khỏi guest cart

**2. Món chưa có (MOVE)**
- Nếu item chưa có trong giỏ user → Di chuyển sang giỏ user
- Giữ nguyên toàn bộ thông tin (quantity, ingredients, comboOptions)

**3. Dọn dẹp**
- Xóa guest cart sau khi đã xử lý hết items

**Lưu ý:**
- Yêu cầu đăng nhập (Bearer Token)
- SessionId tự động lấy từ cookie
- Tự động phát hiện và xử lý cả món lẻ và combo
    `
  })
  @ApiResponse({
    status: 200,
    description: 'Đồng bộ thành công',
    schema: {
      example: {
        message: 'Đồng bộ giỏ hàng thành công!'
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Không có giỏ hàng guest',
    schema: {
      example: {
        message: 'Không có giỏ hàng khách để merge.'
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa đăng nhập',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized'
      }
    }
  })
  async mergeCart(@Req() req: Request, @Res({ passthrough: true }) _res: Response) {
    const sessionId = Helper.getSessionIdFromRequest(req);
    const userId = (req.user as { uid: number; role: string }).uid;
    return await this.cartItemService.mergerCart(sessionId, userId);
  }


  @Get('/get-cartitems')
  async getCartItemsByCartId
    (@Req() req: Request,
    ) {
    const transaction = await this.transaction.transaction()
    const sessionId = Helper.getSessionIdFromRequest(req)
    let userId: number | null = null
    const authBearer = req.headers?.authorization
    if (authBearer && authBearer.startsWith('Bearer ')) {
      try {
        const token = authBearer.substring(7)
        const decoded = this.JWTservice.verify(token, this.configService.get('JWT_SECRET')) as any
        userId = decoded.uid
      } catch (error: any) {
        userId = null
      }
    }
    const cartId = await this.cartService.getCartByContext(sessionId, userId, transaction)

    return await this.cartItemService.getCartItemByCartId(cartId?.dataValues?.id, transaction)

  }


  @Put('/items/:cartItemId')
  @ApiOperation({
    summary: 'Cập nhật cart item',
    description: 'Cho phép cập nhật quantity, variant, ingredients hoặc comboOptions của combo'
  })
  @ApiParam({
    name: 'cartItemId',
    type: Number,
    example: 123
  })
  @ApiBody({
    type: UpdateCartItemDto,
    examples: {
      'update-combo': {
        summary: 'Update comboOptions',
        value: {
          type: 'COMBO',
          comboOptions: [
            {
              comboItemId: 4,
              slotIndex: 0,
              productId: 8,
              productVariantId: 30,
              ingredients: [
                {
                  ingredientId: 3,
                  quantity: 1,
                  type: 'ADD'
                }
              ]
            },
            {
              comboItemId: 5,
              slotIndex: 0,
              productId: 11,
              productVariantId: 35
            }
          ]
        }
      },
      'update-quantity-only': {
        summary: 'Chỉ update số lượng',
        value: {
          quantity: 3
        }
      },
      'update-single-pizza': {
        summary: 'Update món lẻ (variant + ingredients)',
        value: {
          productVariantId: 8,
          type: 'SINGLE',
          singleProductOptions: [
            {
              ingredientId: 1,
              quantity: 2,
              type: 'ADD'
            }
          ]
        }
      }
    }
  })
  async updateCartItem(
    @Param('cartItemId') cartItemId: number,
    @Body() updateDto: UpdateCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) _res: Response
  ) {
    const sessionId = Helper.getSessionIdFromRequest(req);
    let userId: number | null = null;

    const authHeader = req.headers?.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = this.JWTservice.verify(
          token,
          this.configService.get('JWT_SECRET')
        ) as any;
        userId = decoded.uid;
      } catch (error: any) {
        userId = null;
      }
    }

    return await this.cartItemService.updateCartItem(
      cartItemId,
      updateDto,
      userId,
      sessionId
    );
  }
}
