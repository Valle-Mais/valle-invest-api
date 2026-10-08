import { Test, TestingModule } from '@nestjs/testing';
import { ClientTransactionsService } from './client-transactions.service';

describe('ClientTransactionsService', () => {
  let service: ClientTransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientTransactionsService],
    }).compile();

    service = module.get<ClientTransactionsService>(ClientTransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
