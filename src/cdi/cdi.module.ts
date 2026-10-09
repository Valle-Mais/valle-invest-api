import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CdiService } from './cdi.service';

@Module({
  // Importa o HttpModule para que o HttpService fique disponível para injeção
  imports: [HttpModule],
  // Declara o CdiService como um "provider" deste módulo
  providers: [CdiService],
  // Exporta o CdiService para que outros módulos que importarem o CdiModule possam usá-lo
  exports: [CdiService],
})
export class CdiModule {}
