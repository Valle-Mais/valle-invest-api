import { FundOperation } from '../entities/fund-operation.entity';

export class PaginatedFundOperationResponseDto {
  data: FundOperation[];
  total: number;
}
