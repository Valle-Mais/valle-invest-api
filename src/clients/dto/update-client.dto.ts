import { PartialType } from '@nestjs/mapped-types';
import { CreateClientDto } from './create-client.dto';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateClientDto extends PartialType(CreateClientDto) {
    @IsIn(['Ativo', 'Inativo'], { message: 'O status deve ser "Ativo" ou "Inativo".' })
    @IsOptional()
    status?: 'Ativo' | 'Inativo';
}