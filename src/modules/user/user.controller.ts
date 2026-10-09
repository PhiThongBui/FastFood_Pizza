import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserService } from './user.service';
import { ParseIntPipe, Patch } from '@nestjs/common';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { RolesGuard } from '@/common/guards/role.guards';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { USER_PERMISSIONS } from '@/common/constants/permissions.constant';
import { ENUMROLE } from '@/models';
import { CreateUserDto } from './dto/register.dto';
import { GetCurrentResponseDto } from './dto/getCurrent.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JWTGuard } from '../auth/guards/verifyjwt.guard';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UpdateProfileDto } from './dto/updateProfile.dto';
import { GetAllUserDto, UserResponseDto } from './dto/getAllUser.dto';
import {
  ResendRegistationDto,
  VerifyRegistationDto,
} from './dto/verifyRegistation.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import { UpdateUserAccessDto } from './dto/update-user-access.dto';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}
  @Post('/create')
  @ApiOperation({ summary: 'Tạo mới người dùng' })
  @ApiBody({ type: CreateUserDto, required: true })
  Register(@Body() createData: CreateUserDto) {
    return this.userService.register(createData);
  }

  @Post('verify')
  @ApiBody({ type: VerifyRegistationDto, required: true })
  @ApiOperation({ summary: 'Xác thực người dùng' })
  verifyRegistation(@Body() data: VerifyRegistationDto) {
    return this.userService.verifyRegistation(data);
  }

  @Post('resend-verify')
  @ApiBody({ type: ResendRegistationDto, required: true })
  @ApiOperation({ summary: 'Resend verification email' })
  resendVerificationEmail(@Body() data: ResendRegistationDto) {
    return this.userService.resendVerificationEmail(data);
  }

  @UseGuards(JWTGuard)
  @Post('upload-avatar')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload avatar người dùng' })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          const uploadPath = './uploads/avatars';
          mkdirSync(uploadPath, { recursive: true });
          callback(null, uploadPath);
        },
        filename: (_req, file, callback) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `avatar-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp|gif)$/)) {
          return callback(
            new BadRequestException('Chỉ hỗ trợ file ảnh'),
            false,
          );
        }

        callback(null, true);
      },
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
    }),
  )
  uploadAvatar(
    @UploadedFile() file: { filename: string } | undefined,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Avatar file is required');

    const protocol = req.protocol;
    const host = req.get('host');
    const avatarUrl = `${protocol}://${host}/uploads/avatars/${file.filename}`;

    return {
      message: 'Upload avatar successfully',
      data: {
        avatar: avatarUrl,
      },
    };
  }

  @UseGuards(JWTGuard)
  @Get('current')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
  @ApiResponse({
    status: 200,
    description: 'Thông tin người dùng',
    type: GetCurrentResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa được xác thực',
  })
  async getCurrent(@Req() req: any) {
    let userId: number | null = req.user?.uid || null;
    const authBearer = req.headers?.authorization;
    if (!userId && authBearer && authBearer.startsWith('Bearer ')) {
      try {
        const token = authBearer.substring(7);
        const secret = this.configService.get('JWT_SECRET');
        const decoded = this.jwtService.verify(token, secret ? { secret } : undefined) as any;
        userId = decoded?.uid || null;
      } catch (error: any) {
        userId = null;
      }
    }
    if (!userId) throw new BadRequestException('User id not found!!!');
    return this.userService.getCurrentUser(userId);
  }

  @UseGuards(JWTGuard)
  @Put('update-profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cập nhật thông tin người dùng' })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật thông tin người dùng',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' }) // Thêm cho auth fail
  @ApiResponse({ status: 404, description: 'Người dùng không tồn tại' })
  @ApiResponse({ status: 409, description: 'Email hoặc phone đã tồn tại' })
  async updateProfileUser(@Body() data: UpdateProfileDto, @Req() req: any) {
    let userId: number | null = req.user?.uid || null;
    const authBearer = req.headers?.authorization;
    if (!userId && authBearer && authBearer.startsWith('Bearer ')) {
      try {
        const token = authBearer.substring(7);
        const secret = this.configService.get('JWT_SECRET');
        const decoded = this.jwtService.verify(token, secret ? { secret } : undefined) as any;
        userId = decoded?.uid || null;
      } catch (error: any) {
        userId = null;
      }
    }
    if (!userId) throw new BadRequestException('User id not found!!!');
    return this.userService.updateProfile(data, userId);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Get('getUsers')
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(USER_PERMISSIONS.ACCESS_VIEW, USER_PERMISSIONS.ACCESS_MANAGE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy danh sách người dùng' })
  @ApiResponse({
    status: 200,
    type: UserResponseDto,
    description: 'Danh sách người dùng',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' }) // Thêm cho auth fail
  async getAllUser(@Query() query: GetAllUserDto, @Req() _req: any) {
    // let userId: number | null = null
    // const authBearer = req.headers?.authorization
    // if (authBearer && authBearer.startsWith('Bearer ')) {
    //   try {
    //     const token = authBearer.substring(7)
    //     const decoded = this.jwtService.verify(token, this.configService.get('JWT_SECRET')) as any
    //     userId = decoded.uid
    //   } catch (error: any) {
    //     userId = null
    //   }
    // }
    // if (!userId) throw new BadRequestException('User id not found!!!')
    return this.userService.getUsers(query);
  }

  @Get('getUser/:id')
  @ApiOperation({ summary: 'Lấy người dùng theo id' })
  @ApiResponse({
    status: 200,
    type: UserResponseDto,
    description: 'Thông tin người dùng',
  })
  async getUserById(@Param('id') id: number) {
    return this.userService.findById(id);
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Get('admin/permissions')
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(USER_PERMISSIONS.ACCESS_VIEW, USER_PERMISSIONS.ACCESS_MANAGE)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy danh sách nhóm quyền động từ database' })
  getPermissionGroups() {
    return this.userService.getPermissionGroups();
  }

  @UseGuards(JWTGuard, RolesGuard, PermissionsGuard)
  @Patch('admin/:id/access')
  @Roles(ENUMROLE.ADMIN, ENUMROLE.STAFF)
  @Permissions(USER_PERMISSIONS.ACCESS_MANAGE)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cập nhật role, permissions và trạng thái tài khoản',
  })
  updateUserAccess(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserAccessDto,
  ) {
    return this.userService.updateUserAccess(id, dto);
  }
}
