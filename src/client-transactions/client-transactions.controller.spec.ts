import { Test, TestingModule } from '@nestjs/testing';
import { ClientTransactionsController } from './client-transactions.controller';
import { ClientTransactionsService } from './client-transactions.service';

describe('ClientTransactionsController', () => {
  let controller: ClientTransactionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientTransactionsController],
      providers: [ClientTransactionsService],
    }).compile();

    controller = module.get<ClientTransactionsController>(
      ClientTransactionsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
