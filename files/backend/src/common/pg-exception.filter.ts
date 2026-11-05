import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Traduz erros do Postgres em respostas HTTP sem vazar detalhes internos.
const MAP: Record<string, [number, string]> = {
  '42501': [HttpStatus.FORBIDDEN, 'Acesso negado'],                 // RLS / privilégio
  '23505': [HttpStatus.CONFLICT, 'Registro já existe'],            // unique
  '23P01': [HttpStatus.CONFLICT, 'Período conflita com outro registro'], // exclusion
  '23514': [HttpStatus.BAD_REQUEST, 'Valor inválido'],              // check
  '23503': [HttpStatus.BAD_REQUEST, 'Referência inexistente'],      // foreign key
  '22007': [HttpStatus.BAD_REQUEST, 'Data inválida'],
  '22008': [HttpStatus.BAD_REQUEST, 'Data inválida'],
  '22P02': [HttpStatus.BAD_REQUEST, 'Formato inválido'],
};

@Catch()
export class PgExceptionFilter extends BaseExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    if (e instanceof HttpException) return super.catch(e, host);
    if (e?.code === 'P0001') return super.catch(new HttpException(String(e.message), HttpStatus.UNPROCESSABLE_ENTITY), host); // regras dos triggers (mensagens nossas)
    const m = MAP[e?.code];
    if (m) return super.catch(new HttpException(m[1], m[0]), host);
    console.error(e);
    return super.catch(new HttpException('Erro interno', HttpStatus.INTERNAL_SERVER_ERROR), host);
  }
}
