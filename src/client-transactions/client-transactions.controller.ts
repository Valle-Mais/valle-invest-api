import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ClientTransactionsService } from './client-transactions.service';
import { CreateClientTransactionDto } from './dto/create-client-transaction.dto';
import { UpdateClientTransactionDto } from './dto/update-client-transaction.dto';
import { FindAllTransactionsDto } from './dto/find-all-transactions.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { assertOwnership } from '../auth/ownership';

@Controller('client-transactions')
export class ClientTransactionsController {
  constructor(
    private readonly clientTransactionsService: ClientTransactionsService,
  ) {}

  /** Admin registra uma transação já aprovada em nome de um cliente. */
  @Roles('admin')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createClientTransactionDto: CreateClientTransactionDto) {
    if (!createClientTransactionDto.clientId) {
      throw new BadRequestException('Informe o cliente da transação.');
    }
    return this.clientTransactionsService.create(
      {
        ...createClientTransactionDto,
        clientId: createClientTransactionDto.clientId,
      },
      'Aprovado',
    );
  }

  /**
   * Cliente solicita aporte ou resgate. O clientId do body é ignorado:
   * a solicitação é sempre em nome de quem está autenticado.
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  createRequest(
    @Body() createClientTransactionDto: CreateClientTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientTransactionsService.create(
      { ...createClientTransactionDto, clientId: user.userId },
      'Pendente',
    );
  }

  @Roles('admin')
  @Get('pending/count')
  getPendingCount() {
    return this.clientTransactionsService.getPendingCount();
  }

  /** Admin filtra livremente; cliente sempre recebe só as próprias. */
  @Get()
  findAll(
    @Query() query: FindAllTransactionsDto,
    @CurrentUser() user: AuthUser,
  ) {
    const filters =
      user.role === 'admin' ? query : { ...query, clientId: user.userId };
    return this.clientTransactionsService.findAll(filters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const transaction = await this.clientTransactionsService.findOne(id);
    assertOwnership(user, transaction.clientId);
    return transaction;
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateClientTransactionDto: UpdateClientTransactionDto,
  ) {
    return this.clientTransactionsService.update(
      id,
      updateClientTransactionDto,
    );
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.clientTransactionsService.remove(id);
  }
}
