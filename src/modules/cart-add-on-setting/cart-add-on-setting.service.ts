import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  CartAddOnCategorySetting,
  CartAddOnProductSetting,
  Category,
  Product,
  ProductVariant,
  PRODUCTVARIANTSIZE,
  PRODUCTVARIANTTYPE,
} from '@/models';
import { Op } from 'sequelize';
import { CreateCartAddOnCategorySettingDto } from './dto/create-cart-add-on-category-setting.dto';
import { UpdateCartAddOnCategorySettingDto } from './dto/update-cart-add-on-category-setting.dto';
import { CartAddOnProductsQueryDto } from './dto/cart-add-on-products-query.dto';
import { CreateCartAddOnProductSettingDto } from './dto/create-cart-add-on-product-setting.dto';
import { UpdateCartAddOnProductSettingDto } from './dto/update-cart-add-on-product-setting.dto';

type AddOnProduct = {
  productId: number;
  variantId: number;
  name: string;
  imageUrl: string;
  price: number;
  categoryId: number;
  categoryName: string;
};

@Injectable()
export class CartAddOnSettingService {
  constructor(
    @InjectModel(CartAddOnCategorySetting)
    private readonly settingModel: typeof CartAddOnCategorySetting,
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(ProductVariant)
    private readonly productVariantModel: typeof ProductVariant,
    @InjectModel(CartAddOnProductSetting)
    private readonly productSettingModel: typeof CartAddOnProductSetting,
  ) {}

  async getAdminSettings() {
    const data = await this.settingModel.findAll({
      include: [{ model: Category, required: false }],
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    });

    return {
      data,
      message: 'Cart add-on category settings loaded',
    };
  }

  async createSetting(dto: CreateCartAddOnCategorySettingDto) {
    await this.assertCategoryExists(dto.categoryId);

    const existed = await this.settingModel.findOne({
      where: { categoryId: dto.categoryId },
    });

    if (existed) {
      throw new BadRequestException('Category is already configured for cart add-ons');
    }

    const setting = await this.settingModel.create({
      categoryId: dto.categoryId,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
      maxItems: dto.maxItems ?? 10,
    } as any);

    return setting.reload({ include: [Category] });
  }

  async updateSetting(id: number, dto: UpdateCartAddOnCategorySettingDto) {
    const setting = await this.findSettingOrThrow(id);

    if (dto.categoryId !== undefined && dto.categoryId !== setting.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
      const existed = await this.settingModel.findOne({
        where: {
          categoryId: dto.categoryId,
          id: { [Op.ne]: id },
        },
      });

      if (existed) {
        throw new BadRequestException('Category is already configured for cart add-ons');
      }
    }

    await setting.update(this.removeUndefinedValues({
      categoryId: dto.categoryId,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
      maxItems: dto.maxItems,
    }) as any);

    return setting.reload({ include: [Category] });
  }

  async getAdminProductSettings() {
    const data = await this.productSettingModel.findAll({
      include: [
        {
          model: CartAddOnCategorySetting,
          required: true,
          include: [{ model: Category, required: false }],
        },
        {
          model: Product,
          required: true,
          include: [
            { model: Category, required: false, attributes: ['id', 'name'] },
            { model: ProductVariant, required: false },
          ],
        },
        { model: ProductVariant, required: false },
      ],
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    });

    return {
      data,
      message: 'Cart add-on product settings loaded',
    };
  }

  async createProductSetting(dto: CreateCartAddOnProductSettingDto) {
    await this.assertProductBelongsToCategorySetting(dto.categorySettingId, dto.productId, dto.variantId);

    const existed = await this.productSettingModel.findOne({
      where: {
        categorySettingId: dto.categorySettingId,
        productId: dto.productId,
      },
    });

    if (existed) {
      throw new BadRequestException('Product is already configured for this cart add-on category');
    }

    const setting = await this.productSettingModel.create({
      categorySettingId: dto.categorySettingId,
      productId: dto.productId,
      variantId: dto.variantId ?? null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    } as any);

    return this.reloadProductSetting(setting);
  }

  async updateProductSetting(id: number, dto: UpdateCartAddOnProductSettingDto) {
    const setting = await this.findProductSettingOrThrow(id);
    const nextCategorySettingId = dto.categorySettingId ?? setting.categorySettingId;
    const nextProductId = dto.productId ?? setting.productId;
    const nextVariantId = dto.variantId === undefined ? setting.variantId : dto.variantId;

    if (
      dto.categorySettingId !== undefined ||
      dto.productId !== undefined ||
      dto.variantId !== undefined
    ) {
      await this.assertProductBelongsToCategorySetting(nextCategorySettingId, nextProductId, nextVariantId ?? undefined);
    }

    if (
      (dto.categorySettingId !== undefined && dto.categorySettingId !== setting.categorySettingId) ||
      (dto.productId !== undefined && dto.productId !== setting.productId)
    ) {
      const existed = await this.productSettingModel.findOne({
        where: {
          categorySettingId: nextCategorySettingId,
          productId: nextProductId,
          id: { [Op.ne]: id },
        },
      });

      if (existed) {
        throw new BadRequestException('Product is already configured for this cart add-on category');
      }
    }

    await setting.update(this.removeUndefinedValues({
      categorySettingId: dto.categorySettingId,
      productId: dto.productId,
      variantId: dto.variantId,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    }) as any);

    return this.reloadProductSetting(setting);
  }

  async deleteProductSetting(id: number) {
    const setting = await this.findProductSettingOrThrow(id);
    await setting.destroy();

    return {
      data: { id },
      message: 'Cart add-on product setting deleted',
    };
  }

  async deleteSetting(id: number) {
    const setting = await this.findSettingOrThrow(id);
    await setting.destroy();

    return {
      data: { id },
      message: 'Cart add-on category setting deleted',
    };
  }

  async getAddOnProducts(query: CartAddOnProductsQueryDto) {
    const limit = Math.min(Math.max(Number(query.limit || 12), 1), 30);
    const excludeProductIds = this.parseIdList(query.excludeProductIds);

    const productSettings = await this.productSettingModel.findAll({
      where: { isActive: true },
      include: [
        {
          model: CartAddOnCategorySetting,
          required: true,
          where: { isActive: true },
          include: [{ model: Category, required: true, where: { isActive: true } }],
        },
        {
          model: Product,
          required: true,
          where: {
            isActive: true,
            ...(excludeProductIds.length > 0 ? { id: { [Op.notIn]: excludeProductIds } } : {}),
          },
          include: [
            { model: Category, required: true, attributes: ['id', 'name'] },
            {
              model: ProductVariant,
              required: true,
              where: {
                isActive: true,
              },
            },
          ],
        },
        {
          model: ProductVariant,
          required: false,
          where: {
            isActive: true,
          },
        },
      ],
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    });

    if (productSettings.length === 0) {
      return { data: [], message: 'No cart add-on products configured' };
    }

    const countsByCategory = new Map<number, number>();
    const suggestions: AddOnProduct[] = [];

    productSettings
      .sort((first, second) => {
        const firstCategorySetting = this.getAssociation<CartAddOnCategorySetting>(first, 'categorySetting');
        const secondCategorySetting = this.getAssociation<CartAddOnCategorySetting>(second, 'categorySetting');
        const firstCategoryOrder = firstCategorySetting?.sortOrder ?? 0;
        const secondCategoryOrder = secondCategorySetting?.sortOrder ?? 0;
        if (firstCategoryOrder !== secondCategoryOrder) return firstCategoryOrder - secondCategoryOrder;

        return (first.sortOrder ?? 0) - (second.sortOrder ?? 0);
      })
      .forEach((setting) => {
        if (suggestions.length >= limit) return;

        const product = this.getAssociation<Product>(setting, 'product');
        if (!product) return;

        const categoryId = Number(product.categoryId);
        const currentCount = countsByCategory.get(categoryId) || 0;
        const categorySetting = this.getAssociation<CartAddOnCategorySetting>(setting, 'categorySetting');
        const maxItems = Number(categorySetting?.maxItems || limit);
        if (currentCount >= maxItems) return;

        const variant =
          this.getAssociation<ProductVariant>(setting, 'variant') ||
          this.pickDefaultVariant(this.getAssociation<ProductVariant[]>(product, 'variants') || []);
        if (!variant) return;

        const category = this.getAssociation<Category>(product, 'category');

        suggestions.push({
          productId: Number(product.id),
          variantId: Number(variant.id),
          name: product.name,
          imageUrl: product.imageUrl,
          price: Number(product.basePrice || 0) + Number(variant.modifiedPrice || 0),
          categoryId,
          categoryName: category?.name || '',
        });
        countsByCategory.set(categoryId, currentCount + 1);
      });

    return {
      data: suggestions,
      message: 'Cart add-on products loaded',
    };
  }

  private async assertCategoryExists(categoryId: number) {
    const category = await this.categoryModel.findByPk(categoryId);
    if (!category) {
      throw new NotFoundException(`Category with id ${categoryId} not found`);
    }
  }

  private async findSettingOrThrow(id: number) {
    const setting = await this.settingModel.findByPk(id);
    if (!setting) {
      throw new NotFoundException(`Cart add-on category setting with id ${id} not found`);
    }

    return setting;
  }

  private async findProductSettingOrThrow(id: number) {
    const setting = await this.productSettingModel.findByPk(id);
    if (!setting) {
      throw new NotFoundException(`Cart add-on product setting with id ${id} not found`);
    }

    return setting;
  }

  private async assertProductBelongsToCategorySetting(
    categorySettingId: number,
    productId: number,
    variantId?: number,
  ) {
    const categorySetting = await this.findSettingOrThrow(categorySettingId);
    const product = await this.productModel.findByPk(productId);

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    if (Number(product.categoryId) !== Number(categorySetting.categoryId)) {
      throw new BadRequestException('Product must belong to the selected cart add-on category');
    }

    if (variantId !== undefined && variantId !== null) {
      const variant = await this.productVariantModel.findOne({
        where: {
          id: variantId,
          productId,
          isActive: true,
        },
      });

      if (!variant) {
        throw new BadRequestException('Variant must belong to the selected product');
      }
    }
  }

  private reloadProductSetting(setting: CartAddOnProductSetting) {
    return setting.reload({
      include: [
        {
          model: CartAddOnCategorySetting,
          required: true,
          include: [{ model: Category, required: false }],
        },
        {
          model: Product,
          required: true,
          include: [
            { model: Category, required: false, attributes: ['id', 'name'] },
            { model: ProductVariant, required: false },
          ],
        },
        { model: ProductVariant, required: false },
      ],
    });
  }

  private pickDefaultVariant(variants: ProductVariant[]) {
    if (!variants.length) return null;

    return (
      variants.find(
        (variant) =>
          variant.size === PRODUCTVARIANTSIZE.DEFAULT &&
          variant.type === PRODUCTVARIANTTYPE.DEFAULT,
      ) ||
      variants.find((variant) => Number(variant.modifiedPrice || 0) === 0) ||
      variants[0]
    );
  }

  private parseIdList(value?: string) {
    if (!value) return [];

    return Array.from(new Set(
      value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((id) => Number.isInteger(id) && id > 0),
    ));
  }

  private removeUndefinedValues(payload: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
  }

  private getAssociation<T>(model: unknown, key: string) {
    const instance = model as {
      get?: (key: string) => unknown;
      dataValues?: Record<string, unknown>;
    };

    return (instance.get?.(key) || instance.dataValues?.[key]) as T | undefined;
  }
}
