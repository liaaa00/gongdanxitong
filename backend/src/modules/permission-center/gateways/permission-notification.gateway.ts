import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/permission-updates',
  cors: {
    origin: '*',
  },
})
export class PermissionNotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('PermissionNotificationGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 广播权限配置更新
   */
  async broadcastConfigUpdate(versionId: string) {
    this.logger.log(`Broadcasting config update: version ${versionId}`);
    this.server.emit('config-updated', {
      versionId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 广播权限配置激活
   */
  async broadcastConfigActivated(versionId: string, version: string) {
    this.logger.log(`Broadcasting config activated: ${version}`);
    this.server.emit('config-activated', {
      versionId,
      version,
      timestamp: new Date().toISOString(),
    });
  }
}
