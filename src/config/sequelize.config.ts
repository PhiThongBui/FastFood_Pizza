import {
  Address,
  CartItemComboOption,
  CartItemComboOptionIngredient,
  CartAddOnCategorySetting,
  CartAddOnProductSetting,
  CartItems,
  CartItemsIngredient,
  Carts,
  Category,
  ChatConversation,
  ChatMessage,
  ChatQuickReply,
  Coupons,
  DiningTable,
  Ingredient,
  KitchenTicket,
  Order,
  OrderItemComboOption,
  OrderItemComboOptionIngredient,
  OrderItemIngredient,
  OrderItems,
  Permission,
  PermissionGroup,
  Product,
  ProductIngredient,
  ProductVariant,
  Reviews,
  StorePolicySetting,
  TableSession,
  User,
  UserCoupons,
} from '@/models';
import { ComboItem } from '@/models/combo-item.model';
import { Combo } from '@/models/combo.model';
import { ConfigService } from '@nestjs/config';

export const sequelizeConfig = (config: ConfigService) => {
  const isLocal = config.get('DB_HOST') === 'localhost';
  const dbSsl = config.get<string>('DB_SSL');
  const shouldUseSsl = dbSsl ? dbSsl === 'true' : !isLocal;
  const shouldSynchronize =
    config.get('DB_SYNCHRONIZE') === 'true' ||
    config.get('DB_SYNC') === 'true' ||
    isLocal;

  const maxConn = parseInt(config.get('DB_MAX_CONN') || '5', 10);
  return {
    dialect: config.get('DB_DIALECT'),
    host: config.get('DB_HOST'),
    port: config.get<number>('DB_PORT') || 5432,
    username: config.get('DB_USERNAME'),
    password: config.get<string>('DB_PASSWORD'),
    database: config.get('DB_NAME'),
    autoLoadModels: true,
    synchronize: shouldSynchronize,
    logging: false, // Tắt SQL logging,
    benchmark: false,
    pool: {
      max: maxConn, // Số lượng kết nối tối đa. Database Free thường chỉ chịu được 5-10.
      min: 0, // Số lượng kết nối tối thiểu
      acquire: 60000, // Thời gian tối đa (ms) để cố lấy kết nối trước khi báo lỗi (60s)
      idle: 10000, // Thời gian (ms) một kết nối rảnh rỗi trước khi bị đóng
    },
    dialectOptions: shouldUseSsl
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
          // Thêm keepAlive để giữ kết nối ổn định hơn trên môi trường cloud
          keepAlive: true,
        }
      : {},
    models: [
      User,
      Product,
      Category,
      ProductVariant,
      ProductIngredient,
      Ingredient,
      CartItems,
      Carts,
      Order,
      OrderItems,
      OrderItemIngredient,
      OrderItemComboOption,
      OrderItemComboOptionIngredient,
      CartItemsIngredient,
      Reviews,
      UserCoupons,
      Coupons,
      Address,
      Combo,
      ComboItem,
      CartItemComboOption,
      CartItemComboOptionIngredient,
      CartAddOnCategorySetting,
      CartAddOnProductSetting,
      ChatConversation,
      ChatMessage,
      ChatQuickReply,
      StorePolicySetting,
      DiningTable,
      TableSession,
      KitchenTicket,
      PermissionGroup,
      Permission,
    ],
  };
};
