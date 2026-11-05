import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PgExceptionFilter } from './common/pg-exception.filter';

/** Configuração compartilhada entre a execução real e os testes de API. */
export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.use(cookieParser());
  // Id de correlação (vai para audit_log) + defesa CSRF: cookie SameSite=Strict
  // e exigência de cabeçalho customizado em métodos que alteram estado.
  app.use((req: any, res: any, next: any) => {
    req.id = randomUUID();
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!safe && req.headers['x-requested-with'] !== 'fetch') return res.status(403).json({ message: 'Requisição rejeitada' });
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PgExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
}
