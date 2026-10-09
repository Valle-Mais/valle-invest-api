import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IbovespaService } from './ibovespa.service';
import { ConfigModule } from '@nestjs/config'; // 1. Importe o ConfigModule

@Module({
  imports: [HttpModule, ConfigModule], // 2. Adicione o ConfigModule aos imports
  providers: [IbovespaService],
  exports: [IbovespaService],
})
export class IbovespaModule {}
