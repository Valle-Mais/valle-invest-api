import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ClientTransactionsService } from './client-transactions.service';
import { CreateClientTransactionDto } from './dto/create-client-transaction.dto';
import { UpdateClientTransactionDto } from './dto/update-client-transaction.dto';
import { FindAllTransactionsDto } from './dto/find-all-transactions.dto';

@Controller('client-transactions')
export class ClientTransactionsController {
  constructor(private readonly clientTransactionsService: ClientTransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createClientTransactionDto: CreateClientTransactionDto) {
    // No cenário real, uma solicitação de cliente viria por aqui com status 'Pendente'
    // Para o admin, podemos assumir que já entra como 'Aprovado'
    return this.clientTransactionsService.create(createClientTransactionDto, 'Aprovado');
  }
  
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  createRequest(@Body() createClientTransactionDto: CreateClientTransactionDto) {
    // Endpoint específico para o cliente criar uma solicitação
    return this.clientTransactionsService.create(createClientTransactionDto, 'Pendente');
  }

  @Get('pending/count')
  getPendingCount() {
    return this.clientTransactionsService.getPendingCount();
  }

  @Get()
  findAll(@Query() query: FindAllTransactionsDto) {
    return this.clientTransactionsService.findAll(query);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientTransactionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClientTransactionDto: UpdateClientTransactionDto) {
    return this.clientTransactionsService.update(id, updateClientTransactionDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.clientTransactionsService.remove(id);
  }
}
