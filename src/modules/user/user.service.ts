import { User } from '@/models';
import { ENUMROLE } from '@/models';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreateUserDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Op } from 'sequelize';
import { UpdateProfileDto } from './dto/updateProfile.dto';
import { Sequelize } from 'sequelize-typescript';
import { GetAllUserDto, UserDto, UserResponseDto } from './dto/getAllUser.dto';
import { plainToClass } from 'class-transformer';
import { ResponseUserByIdDto } from './dto/getUserById.dto';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import {
  ResendRegistationDto,
  VerifyRegistationDto,
} from './dto/verifyRegistation.dto';
import { UpdateUserAccessDto } from './dto/update-user-access.dto';
import { PermissionService } from '../permission/permission.service';

@Injectable()
export class UserService {
  private readonly verificationResendLimit = 3;
  private readonly verificationResendWindowMs = 15 * 60 * 1000;
  private readonly verificationResendCooldownMs = 60 * 1000;
  private readonly verificationResendAttempts = new Map<
    string,
    { count: number; windowStartedAt: number; lastSentAt: number }
  >();

  constructor(
    @InjectModel(User) private readonly UserModel: typeof User,
    private readonly transaction: Sequelize,
    private readonly mailService: MailService,
    private readonly permissionService: PermissionService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private assertCanResendVerification(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const now = Date.now();
    const current = this.verificationResendAttempts.get(normalizedEmail);
    const tracker =
      current && now - current.windowStartedAt < this.verificationResendWindowMs
        ? current
        : { count: 0, windowStartedAt: now, lastSentAt: 0 };

    const cooldownRemaining = this.verificationResendCooldownMs - (now - tracker.lastSentAt);
    if (tracker.lastSentAt && cooldownRemaining > 0) {
      throw new BadRequestException(
        `Vui lòng chờ ${Math.ceil(cooldownRemaining / 1000)} giây trước khi gửi lại mã xác thực.`,
      );
    }

    if (tracker.count >= this.verificationResendLimit) {
      throw new BadRequestException(
        'Bạn đã gửi lại mã quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      );
    }

    this.verificationResendAttempts.set(normalizedEmail, {
      ...tracker,
      count: tracker.count + 1,
      lastSentAt: now,
    });
  }

  async findUserById(userId: number) {
    const user = await this.UserModel.findByPk(userId);
    return {
      message: 'Get User SuccessFully! ',
      data: user,
    };
  }

  async findByEmail(email: string) {
    return await this.UserModel.findOne({
      where: {
        email: email,
      },
    });
  }

  async validateLogin(loginData: LoginDto) {
    const alreadyUser = await this.findByEmail(loginData.email);
    if (!alreadyUser) throw new BadRequestException('Người dùng chưa tồn tại!');
    if (!alreadyUser.dataValues.isEmailVerified)
      throw new BadRequestException('Email chưa được xác thực!');
    if (!alreadyUser.dataValues.isActive)
      throw new ForbiddenException('Tài khoản đã bị khóa hoặc không còn hoạt động');
    const matchesPassword = await alreadyUser.comparePassword(
      loginData.password,
    );

    if (!matchesPassword)
      throw new BadRequestException('Tài khoản hoặc mật khẩu không chính xác');
    const userRaw = alreadyUser.toJSON();

    return { uid: userRaw.id, role: userRaw.role };
  }

  async createGoogleUser(googleUser: any) {
    const newUser = new this.UserModel(googleUser);
    return await newUser.save();
  }

  async updateGoogleId(userId: string, googleId: string) {
    await this.UserModel.update({ googleId }, { where: { id: userId } });

    return await this.UserModel.findOne({ where: { id: userId } });
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    await this.UserModel.update({ refreshToken }, { where: { id: userId } });

    return await this.UserModel.findOne({ where: { id: userId } });
  }

  // Generate 6-digit OTP
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async register(createUserDto: CreateUserDto) {
    const alreadyUser = await this.findByEmail(createUserDto.email);
    if (alreadyUser) throw new BadRequestException('Người dùng đã tồn tại!');

    const otp = this.generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    const newUser = await this.UserModel.create({
      ...createUserDto,
      passwordResetToken: hashedOtp,
      passwordResetExpires: otpExpires,
    } as any);

    await this.mailService.sendVerificationEmail(
      createUserDto.email,
      createUserDto.name,
      otp,
    );

    return {
      data: newUser.getUserProfile(),
      message: 'Create User SuccessFully!',
    };
  }

  async verifyRegistation(data: VerifyRegistationDto) {
    const { otp } = data;
    const email = this.normalizeEmail(data.email);
    const transaction = await this.transaction.transaction();
    try {
      const user = await this.UserModel.findOne({
        where: {
          email: email,
        },
        transaction,
      });

      if (!user) throw new BadRequestException('Người dùng chưa tồn tại!');
      if (user.dataValues.isEmailVerified)
        throw new BadRequestException('Email đã được xác thực!');
      if (
        user.dataValues.passwordResetExpires &&
        user.dataValues.passwordResetExpires < Date.now()
      )
        throw new BadRequestException('OTP đã hết hạn!');
      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

      if (user.dataValues.passwordResetToken !== hashedOtp)
        throw new BadRequestException('OTP không chính xác!');

      await user.update(
        {
          isEmailVerified: true,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
        { transaction },
      );

      await transaction.commit();
      this.verificationResendAttempts.delete(email);

      return {
        message: 'Verify Registation SuccessFully!',
        data: user.getUserProfile(),
      };
    } catch (error: any) {
      console.log(error);
      await transaction.rollback();
      throw error;
    }
  }

  async resendVerificationEmail(data: ResendRegistationDto) {
    const email = this.normalizeEmail(data.email);
    const transaction = await this.transaction.transaction();
    try {
      const user = await this.UserModel.findOne({
        where: {
          email: email,
        },
      });
      if (!user) throw new BadRequestException('Người dùng chưa tồn tại!');
      if (user?.dataValues.isEmailVerified)
        throw new BadRequestException('Email đã được xác thực!');

      this.assertCanResendVerification(email);

      const otp = this.generateOTP();
      const otpExpires = Date.now() + 5 * 60 * 1000;

      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

      if (user) {
        await user.update(
          {
            passwordResetToken: hashedOtp,
            passwordResetExpires: otpExpires,
          },
          { transaction },
        );

        await this.mailService.sendVerificationEmail(
          email,
          user?.dataValues.name,
          otp,
        );
      }

      await transaction.commit();

      return {
        message: 'Resend Registation SuccessFully!',
        email: email,
      };
    } catch (error: any) {
      console.log(error);
      await transaction.rollback();
      throw error;
    }
  }

  async validateRefreshToken(id: number, refreshToken: string) {
    return await this.UserModel.findOne({
      where: {
        id: id,
        refreshToken: refreshToken,
      },
    });
  }

  async removeRefreshToken(refreshToken: string) {
    return await this.UserModel.update(
      { refreshToken: '' },
      { where: { refreshToken: refreshToken } },
    );
  }

  async checkPwResetTokenAndExprised(passwordResetToken: string) {
    return await this.UserModel.findOne({
      where: {
        passwordResetToken: passwordResetToken,
        passwordResetExpires: {
          [Op.gt]: Date.now(),
        },
      },
    });
  }

  async getCurrentUser(userId: number) {
    const user = await this.UserModel.findByPk(userId);

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }
    if (!user.dataValues.isActive) {
      throw new ForbiddenException('Tài khoản đã bị khóa hoặc không còn hoạt động');
    }
    // Trả về user data mà không có password
    return user.getUserProfile();
  }

  async updateProfile(data: UpdateProfileDto, userId: number) {
    const { name, email, phone, avatar } = data;
    const transaction = await this.transaction.transaction();
    try {
      if (Object.keys(data).length === 0)
        throw new BadRequestException('Vui lòng nhập dữ liệu');
      const user = await this.UserModel.findByPk(userId, { transaction });

      if (!user) {
        throw new NotFoundException('Người dùng không tồn tại');
      }
      if (email && email.trim() !== user.email) {
        const alreadyUser = await this.UserModel.findOne({
          where: { email },
          transaction,
        });
        if (alreadyUser) {
          throw new BadRequestException('Email đã được sử dụng');
        }
      }
      if (phone && phone.trim() !== user.phone) {
        const alreadyUser = await this.UserModel.findOne({
          where: { phone },
          transaction,
        });
        if (alreadyUser) {
          throw new BadRequestException('Phone đã được sử dụng');
        }
      }

      const updates: Partial<User> = {};
      if (name) updates.name = name;
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (avatar) updates.avatar = avatar;

      // Object.assign(user, updates);
      // await user.save({ transaction });
      await user.update(updates, { transaction });
      await user.reload({ transaction });
      const updatedUser = user.getUserProfile();
      await transaction.commit();
      return {
        message: 'Updated user successfully',
        data: updatedUser,
      };
    } catch (error: any) {
      console.log(error);
      await transaction.rollback();
      throw error;
    }
  }

  async getUsers(data: GetAllUserDto): Promise<UserResponseDto> {
    const { page = 1, limit = 10, search, isActive = true } = data;
    const transaction = await this.transaction.transaction();
    const offset = (page - 1) * limit;
    const where: Record<string, any> = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      (where as any)[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }
    try {
      const { count, rows: users } = await this.UserModel.findAndCountAll({
        where,
        limit,
        offset,
        transaction,
      });
      const userData = users.map((user) =>
        plainToClass(UserDto, user.get({ plain: true }), {
          excludeExtraneousValues: true,
        }),
      );
      await transaction.commit();
      return {
        totalCount: count,
        pageIndex: page,
        pageSize: limit,
        data: userData,
      };
    } catch (error: any) {
      console.log(error);
      await transaction.rollback();
      throw error;
    }
  }

  async findById(id: number): Promise<ResponseUserByIdDto> {
    const user = await this.UserModel.findByPk(id);

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng này');
    }

    const response = plainToClass(
      ResponseUserByIdDto,
      user.get({ plain: true }),
      {
        excludeExtraneousValues: true,
      },
    );
    return response;
  }

  async updateUserAccess(id: number, dto: UpdateUserAccessDto) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('Vui lòng nhập dữ liệu');

    const user = await this.UserModel.findByPk(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng này');

    if ([ENUMROLE.SUPER_ADMIN, ENUMROLE.ADMIN].includes(user.dataValues.role)) {
      throw new BadRequestException(
        'Admin có toàn quyền và không thể bị chỉnh sửa phân quyền tại đây',
      );
    }

    if (dto.role && [ENUMROLE.SUPER_ADMIN, ENUMROLE.ADMIN].includes(dto.role)) {
      throw new BadRequestException(
        'Không thể cấp hoặc cập nhật tài khoản thành Admin từ trang phân quyền động',
      );
    }

    const nextRole = dto.role ?? user.dataValues.role;
    const updates: Record<string, unknown> = {};

    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    if (dto.permissions !== undefined || dto.role !== undefined) {
      updates.permissions =
        nextRole === ENUMROLE.User
          ? []
          : await this.normalizeUserPermissions(
              dto.permissions || user.dataValues.permissions || [],
            );
    }

    await user.update(updates);
    await user.reload();

    return {
      message: 'Updated user access successfully',
      data: user.getUserProfile(),
    };
  }

  async getPermissionGroups() {
    return this.permissionService.getPermissionGroups();
  }

  private async normalizeUserPermissions(permissions: string[]) {
    const uniquePermissions = Array.from(new Set(permissions));
    const activePermissionValues =
      await this.permissionService.getActivePermissionValues();
    const activePermissionSet = new Set(activePermissionValues);
    const invalidPermissions = uniquePermissions.filter(
      (permission) => !activePermissionSet.has(permission),
    );

    if (invalidPermissions.length > 0) {
      throw new BadRequestException(
        `Permission không hợp lệ: ${invalidPermissions.join(', ')}`,
      );
    }

    return uniquePermissions;
  }
}
