import { Test, TestingModule } from '@nestjs/testing';
import { FundOperationsController } from './fund-operations.controller';
import { FundOperationsService } from './fund-operations.service';

describe('FundOperationsController', () => {
  let controller: FundOperationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FundOperationsController],
      providers: [FundOperationsService],
    }).compile();

    controller = module.get<FundOperationsController>(FundOperationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
