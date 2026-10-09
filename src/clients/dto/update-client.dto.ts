import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

/**
 * Campos que um admin pode alterar num cliente.
 *
 * `role`, `email` e `totalInvestido` ficam de fora de propósito:
 * - role: escalada de privilégio;
 * - totalInvestido: é derivado das transações aprovadas, nunca aceito de fora;
 * - email: é a identidade de login; troca exige fluxo próprio.
 */
export class UpdateClientDto extends PartialType(
  OmitType(CreateClientDto, ['role', 'email', 'totalInvestido'] as const),
) {
  @IsIn(['Ativo', 'Inativo'], {
    message: 'O status deve ser "Ativo" ou "Inativo".',
  })
  @IsOptional()
  status?: 'Ativo' | 'Inativo';
}
