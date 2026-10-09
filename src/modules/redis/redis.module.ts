import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import { RedisTestController } from './redis.controller';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: REDIS_CLIENT,
            useFactory: (configService: ConfigService) => {
                const host = configService.get('REDIS_HOST') || 'localhost';
                const port = configService.get('REDIS_PORT') || 6379;
                const password = configService.get('REDIS_PASSWORD') || undefined;
                const redisTls = configService.get<string>('REDIS_TLS');

                // Kiểm tra xem có đang chạy ở localhost không
                const isLocal = host === 'localhost';
                const shouldUseTls = redisTls ? redisTls === 'true' : !isLocal && host !== 'redis';

                return new Redis({
                    host: host,
                    port: port,
                    password: password,
                    
                    // --- THÊM ĐOẠN NÀY (QUAN TRỌNG CHO UPSTASH) ---
                    tls: shouldUseTls ? {
                        rejectUnauthorized: false // Bỏ qua lỗi chứng chỉ (giúp kết nối mượt hơn)
                    } : undefined,
                    // ----------------------------------------------

                    retryStrategy: (times) => {
                        // Retry mỗi 3 giây, tối đa 5 phút
                        const delay = Math.min(times * 3000, 5 * 60 * 1000);
                        return delay;
                    },
                    maxRetriesPerRequest: 3,
                });
            },
            inject: [ConfigService],
        },
        RedisService,
    ],
    controllers: [RedisTestController],
    exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
