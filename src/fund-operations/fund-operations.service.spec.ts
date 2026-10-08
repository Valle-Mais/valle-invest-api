import { Test, TestingModule } from '@nestjs/testing';
import { FundOperationsService } from './fund-operations.service';

describe('FundOperationsService', () => {
  let service: FundOperationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FundOperationsService],
    }).compile();

    service = module.get<FundOperationsService>(FundOperationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
