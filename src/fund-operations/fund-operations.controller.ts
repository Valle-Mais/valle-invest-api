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
import { PreviewFundOperationDto } from './dto/preview-fund-operation.dto';
import { Roles } from '../auth/decorators/roles.decorator';

/** Operações do fundo: exclusivas do admin. */
@Roles('admin')
@Controller('fund-operations')
export class FundOperationsController {
  constructor(private readonly fundOperationsService: FundOperationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createFundOperationDto: CreateFundOperationDto) {
    return this.fundOperationsService.create(createFundOperationDto);
  }

  /** Simula o rateio antes de salvar. Não grava nada. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: PreviewFundOperationDto) {
    return this.fundOperationsService.previewDistribution(
      dto.resultado,
      dto.data,
    );
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
