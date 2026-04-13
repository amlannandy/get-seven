import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

@Catch(WsException)
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: WsException, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    const error = exception.getError();

    const payload =
      typeof error === 'string'
        ? { code: 'INVALID_ACTION', message: error }
        : (error as { code: string; message: string });

    client.emit('game:error', payload);
  }
}
