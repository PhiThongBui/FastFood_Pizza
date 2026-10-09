import {
    BadRequestException,
    Logger,
    UnauthorizedException,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService, ChatActor } from './chat.service';
import {
    JoinConversationDto,
    ChatTypingDto,
    SocketSendChatMessageDto,
} from './dto/socket-chat.dto';
import { MarkChatReadDto } from './dto/mark-chat-read.dto';
import { ENUMROLE } from '@/models';
import { RedisService } from '../redis/redis.service';
import { REDIS_KEYS } from '../redis/redis.constants';

interface ChatRedisEvent {
    type: 'chat.message.new' | 'chat.read' | 'chat.typing';
    conversationId: number;
    payload: Record<string, unknown>;
    timestamp: string;
}

type SocketWithUser = Socket & {
    data: {
        user?: ChatActor;
    };
};

@UsePipes(
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }),
)
@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true,
    },
    namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);
    private readonly adminRoom = 'chat_admins';

    constructor(
        private readonly chatService: ChatService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
    ) {}

    async afterInit() {
        await this.redisService.subscribeChannel(REDIS_KEYS.CHAT_EVENTS_CHANNEL, (message) => {
            this.handleRedisEvent(message);
        });

        this.logger.log('Chat gateway initialized');
    }

    async handleConnection(client: SocketWithUser) {
        try {
            const user = this.authenticateClient(client);
            (client.data as { user?: ChatActor }).user = user;

            if ([ENUMROLE.SUPER_ADMIN, ENUMROLE.ADMIN].includes(user.role)) {
                await client.join(this.adminRoom);
            }

            client.emit('chat.connected', {
                userId: user.uid,
                role: user.role,
                timestamp: new Date().toISOString(),
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unauthorized';
            this.logger.warn(`Socket authentication failed: ${errorMessage}`);
            client.emit('chat.error', { message: errorMessage });
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        void client;
    }

    @SubscribeMessage('chat.join')
    async handleJoin(
        @ConnectedSocket() client: SocketWithUser,
        @MessageBody() payload: JoinConversationDto,
    ) {
        try {
            const actor = this.getSocketActor(client);
            const conversation = await this.chatService.resolveConversationForActor(
                actor,
                payload?.conversationId,
            );
            const room = this.getConversationRoom(conversation.id);

            await client.join(room);

            return {
                event: 'chat.joined',
                data: {
                    conversationId: conversation.id,
                    room,
                },
            };
        } catch (error: unknown) {
            throw this.toWsException(error);
        }
    }

    @SubscribeMessage('chat.leave')
    async handleLeave(
        @ConnectedSocket() client: SocketWithUser,
        @MessageBody() payload: JoinConversationDto,
    ) {
        try {
            const actor = this.getSocketActor(client);
            const conversation = await this.chatService.resolveConversationForActor(
                actor,
                payload?.conversationId,
            );
            const room = this.getConversationRoom(conversation.id);

            await client.leave(room);

            return {
                event: 'chat.left',
                data: {
                    conversationId: conversation.id,
                    room,
                },
            };
        } catch (error: unknown) {
            throw this.toWsException(error);
        }
    }

    @SubscribeMessage('chat.send')
    async handleSendMessage(
        @ConnectedSocket() client: SocketWithUser,
        @MessageBody() payload: SocketSendChatMessageDto,
    ) {
        try {
            const actor = this.getSocketActor(client);
            const message = await this.chatService.sendMessageFromActor(actor, payload.conversationId, {
                content: payload.content,
                orderId: payload.orderId,
            });

            return {
                event: 'chat.sent',
                data: message,
            };
        } catch (error: unknown) {
            throw this.toWsException(error);
        }
    }

    @SubscribeMessage('chat.read')
    async handleRead(
        @ConnectedSocket() client: SocketWithUser,
        @MessageBody() payload: MarkChatReadDto,
    ) {
        try {
            const actor = this.getSocketActor(client);
            const result = await this.chatService.markConversationAsRead(actor, payload?.conversationId);

            return {
                event: 'chat.read.ack',
                data: result,
            };
        } catch (error: unknown) {
            throw this.toWsException(error);
        }
    }

    @SubscribeMessage('chat.typing')
    async handleTyping(
        @ConnectedSocket() client: SocketWithUser,
        @MessageBody() payload: ChatTypingDto,
    ) {
        try {
            const actor = this.getSocketActor(client);
            const result = await this.chatService.publishTypingEvent(
                actor,
                payload?.conversationId,
                payload.isTyping,
            );

            return {
                event: 'chat.typing.ack',
                data: result,
            };
        } catch (error: unknown) {
            throw this.toWsException(error);
        }
    }

    private handleRedisEvent(rawMessage: string) {
        try {
            const event = JSON.parse(rawMessage) as ChatRedisEvent;
            const room = this.getConversationRoom(event.conversationId);

            switch (event.type) {
                case 'chat.message.new':
                    this.server.to(room).emit('chat.new', event.payload);
                    this.server.to(this.adminRoom).emit('chat.conversation.updated', event.payload);
                    break;
                case 'chat.read':
                    this.server.to(room).emit('chat.read', event.payload);
                    this.server.to(this.adminRoom).emit('chat.conversation.updated', event.payload);
                    break;
                case 'chat.typing':
                    this.server.to(room).emit('chat.typing', event.payload);
                    break;
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown redis event error';
            this.logger.error(`Failed to handle chat redis event: ${errorMessage}`);
        }
    }

    private authenticateClient(client: Socket): ChatActor {
        const authData = client.handshake.auth as { token?: string } | undefined;
        const rawAuthorizationHeader: unknown = client.handshake.headers.authorization;
        const authorizationHeader =
            typeof rawAuthorizationHeader === 'string'
                ? rawAuthorizationHeader
                : Array.isArray(rawAuthorizationHeader) && typeof rawAuthorizationHeader[0] === 'string'
                  ? rawAuthorizationHeader[0]
                  : undefined;
        const handshakeToken =
            typeof authData?.token === 'string' ? authData.token : authorizationHeader;
        const token = this.normalizeBearerToken(handshakeToken);

        if (!token) {
            throw new UnauthorizedException('Missing access token');
        }

        const secret = this.configService.get<string>('JWT_SECRET');
        if (!secret) {
            throw new BadRequestException('JWT secret is not configured');
        }

        const payload = this.jwtService.verify<ChatActor>(token, {
            secret,
        });

        if (!payload?.uid || !payload?.role) {
            throw new UnauthorizedException('Invalid access token');
        }

        return {
            uid: payload.uid,
            role: payload.role,
        };
    }

    private getSocketActor(client: SocketWithUser): ChatActor {
        const actor = (client.data as { user?: ChatActor }).user;
        if (!actor) {
            throw new UnauthorizedException('Socket is not authenticated');
        }

        return actor;
    }

    private normalizeBearerToken(token?: string) {
        if (!token) return '';
        return token.startsWith('Bearer ') ? token.slice(7) : token;
    }

    private getConversationRoom(conversationId: number) {
        return `chat_conversation_${conversationId}`;
    }

    private toWsException(error: unknown) {
        if (error instanceof WsException) {
            return error;
        }

        if (error instanceof Error) {
            return new WsException(error.message);
        }

        return new WsException('Socket request failed');
    }
}
