import { PartialType } from '@nestjs/mapped-types';
import { CreateClientTransactionDto } from './create-client-transaction.dto';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateClientTransactionDto extends PartialType(CreateClientTransactionDto) {
    @IsIn(['Pendente', 'Aprovado', 'Negado'], { message: 'O status deve ser "Pendente", "Aprovado" ou "Negado".' })
    @IsOptional()
    status?: 'Pendente' | 'Aprovado' | 'Negado';
}