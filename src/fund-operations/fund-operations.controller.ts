import {
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
import { FundOperationsService } from './fund-operations.service';
import { CreateFundOperationDto } from './dto/create-fund-operation.dto';
import { UpdateFundOperationDto } from './dto/update-fund-operation.dto';
import { FindAllFundOperationsDto } from './dto/find-all-fund-operations.dto';

@Controller('fund-operations')
export class FundOperationsController {
  constructor(private readonly fundOperationsService: FundOperationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createFundOperationDto: CreateFundOperationDto) {
    return this.fundOperationsService.create(createFundOperationDto);
  }

  @Get()
  findAll(@Query() query: FindAllFundOperationsDto) {
    return this.fundOperationsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fundOperationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateFundOperationDto: UpdateFundOperationDto,
  ) {
    return this.fundOperationsService.update(id, updateFundOperationDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.fundOperationsService.remove(id);
  }
}
