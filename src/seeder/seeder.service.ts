/* eslint-disable prettier/prettier */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientTransactionsService } from 'src/client-transactions/client-transactions.service';
import { ClientsService } from 'src/clients/clients.service';
import { FundOperationsService } from 'src/fund-operations/fund-operations.service';
import { Firestore } from '@google-cloud/firestore';
import { CreateFundOperationDto } from '../fund-operations/dto/create-fund-operation.dto';
import { Client } from 'src/clients/entities/client.entity';
import { PerformanceService } from 'src/performance/performance.service';

@Injectable()
export class SeederService {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    @Inject('FIRESTORE') private readonly firestore: Firestore,
    private readonly clientsService: ClientsService,
    private readonly transactionsService: ClientTransactionsService,
    private readonly operationsService: FundOperationsService,
    private readonly performanceService: PerformanceService, // 2. Injete o serviço
  ) {}

  async seed() {
    this.logger.log('--- INICIANDO PROCESSO DE SEEDING ---');
    await this.cleanDatabase();
    const clients = await this.seedClients();
    await this.seedFundOperations();
    const activeClients = clients.filter(c => c.status === 'Ativo');
    await this.seedClientTransactions(activeClients);
    await this.generateSeedReport();
    this.logger.log('-----   SEEDING CONCLUÍDO -----');
  }

  /** Função auxiliar 100% segura para criar datas no passado. */
private getDateMonthsAgo(monthsAgo: number, day: number): Date {
    const today = new Date();
    let targetYear = today.getFullYear();
    let targetMonth = today.getMonth() - monthsAgo;

    // Corrige o ano e o mês se o mês for negativo
    while (targetMonth < 0) {
      targetMonth += 12;
      targetYear--;
    }
    
    // Garante que o dia não "estoure" para o mês seguinte (ex: 31 em Fev)
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const safeDay = Math.min(day, lastDayOfMonth);

    return new Date(targetYear, targetMonth, safeDay);
  }

  private async cleanDatabase() {
    this.logger.log('Iniciando limpeza do banco de dados para o seed...');

    // 1. Apagar todos os usuários que não são admin (ou seja, todos os 'client')
    this.logger.log("Removendo usuários com role 'client'...");
    const usersQuery = await this.firestore.collection('users').where('role', '!=', 'admin').get();
    
    if (!usersQuery.empty) {
        const deletePromises = usersQuery.docs.map(doc => doc.ref.delete());
        await Promise.all(deletePromises);
        this.logger.log(`${usersQuery.size} usuários 'client' removidos.`);
    } else {
        this.logger.log("Nenhum usuário 'client' para remover.");
    }

    // 2. Apagar as coleções de movimentações
    const collections = ['client_transactions', 'fund_operations'];
    for (const col of collections) {
        this.logger.log(`Limpando coleção '${col}'...`);
        const snapshot = await this.firestore.collection(col).get();
        if (!snapshot.empty) {
            const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);
        }
        this.logger.log(`Coleção '${col}' limpa.`);
    }
  }

   private async seedClients(): Promise<Client[]> {
    this.logger.log('Criando clientes fantasmas...');
    const fantasyClientsData: Omit<Client, 'id'>[] = [
      { name: 'Ana Beatriz', email: 'ana.beatriz@example.com', role: 'client', status: 'Ativo', joinDate: new Date(), totalInvestido: 0 },
      { name: 'Bruno Costa', email: 'bruno.costa@example.com', role: 'client', status: 'Ativo', joinDate: new Date(), totalInvestido: 0 },
      { name: 'Carla Dias', email: 'carla.dias@example.com', role: 'client', status: 'Ativo', joinDate: new Date(), totalInvestido: 0 },
      { name: 'Daniel Alves (Inativo)', email: 'daniel.alves@example.com', role: 'client', status: 'Inativo', joinDate: new Date(), totalInvestido: 0 },
    ];

    const createdClients: Client[] = [];
    for (const clientData of fantasyClientsData) {
        const existing = await this.clientsService.findByEmail(clientData.email);
        if (!existing) {
            createdClients.push(await this.clientsService.create(clientData as any));
        } else {
            createdClients.push(existing);
        }
    }
    this.logger.log(`${createdClients.length} clientes fantasmas verificados/criados.`);
    return createdClients;
  }


private async seedFundOperations() {
    this.logger.log('Gerando histórico de trades do fundo...');
    const operations: CreateFundOperationDto[] = [];
    const monthsToSeed = 18;

    for (let i = monthsToSeed - 1; i >= 0; i--) {
        const numTrades = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < numTrades; j++) {
            const day = Math.floor(Math.random() * 28) + 1;
            const date = this.getDateMonthsAgo(i, day);
            
            const valorInvestido = 1000 + Math.random() * 9000;
            const valorVenda = valorInvestido * (1 + (Math.random() * 0.40 - 0.15));

            operations.push({
                data: date.toISOString().split('T')[0],
                descricao: `Trade Aleatório #${j + 1}`,
                valorInvestido,
                valorVenda,
            });
        }
    }

    for (const op of operations) {
        await this.operationsService.create(op);
    }
    this.logger.log(`${operations.length} trades do fundo criados.`);
  }

 private async seedClientTransactions(clients: Client[]) {
    this.logger.log('Gerando histórico de transações de clientes...');
    for (const client of clients) {
        const initialDate = this.getDateMonthsAgo(17, Math.floor(Math.random() * 28) + 1);
        await this.transactionsService.create({ clientId: client.id, data: initialDate.toISOString(), tipo: 'Aporte', valor: 2000 + Math.random() * 8000 }, 'Aprovado');

        for (let i = 16; i >= 0; i--) {
            if (Math.random() < 0.7) {
                const day = Math.floor(Math.random() * 28) + 1;
                await this.transactionsService.create({
                    clientId: client.id,
                    data: this.getDateMonthsAgo(i, day).toISOString(),
                    tipo: 'Aporte',
                    valor: 100 + Math.random() * 900,
                }, 'Aprovado');
            }
            if (i > 6 && Math.random() < 0.15) {
                const day = Math.floor(Math.random() * 28) + 1;
                await this.transactionsService.create({
                    clientId: client.id,
                    data: this.getDateMonthsAgo(i, day).toISOString(),
                    tipo: 'Resgate',
                    valor: 200 + Math.random() * 500,
                }, 'Aprovado');
            }
        }
    }
  }

  private async generateSeedReport() {
    const [allOperationsResponse, allClients] = await Promise.all([
      this.operationsService.findAll({}),
      this.clientsService.findAll(),
    ]);
    const allOperations = allOperationsResponse.data;

    // CORRIGIDO: Usa a propriedade 'resultado'
    const totalFundProfit = allOperations.reduce((sum, op) => sum + op.resultado, 0);

    const activeClients = allClients.filter(c => c.role === 'client' && c.status === 'Ativo');
    const totalInvestedAllClients = activeClients.reduce((sum, client) => sum + (client.totalInvestido || 0), 0);

    if (totalInvestedAllClients <= 0) {
      this.logger.warn('Patrimônio total zerado. Relatório não pode ser gerado.');
      return;
    }

    const report = activeClients.map(client => {
      const participationPercent = (client.totalInvestido / totalInvestedAllClients);
      const profitShare = totalFundProfit * participationPercent;
      return {
        'Cliente': client.name,
        'Valor Investido (R$)': client.totalInvestido.toFixed(2),
        'Participação (%)': (participationPercent * 100).toFixed(2) + '%',
        'Lucro Atribuído (R$)': profitShare.toFixed(2),
      };
    });

    this.logger.log('\n\n--- RELATÓRIO DE DISTRIBUIÇÃO DE LUCRO (Simulação do Seeder) ---');
    console.table(report);
    this.logger.log(`Lucro Total do Fundo: R$ ${totalFundProfit.toFixed(2)}`);
    this.logger.log(`Patrimônio Total de Clientes: R$ ${totalInvestedAllClients.toFixed(2)}`);
    this.logger.log('------------------------------------------------------------------\n');
  }

  async backfillLucroPercentual() {
    this.logger.log('Iniciando backfill para o campo "lucroPercentual"...');

    const opsToFixSnapshot = await this.firestore
      .collection('fund_operations')
      .where('status', '==', 'Fechada')
      .get();

    if (opsToFixSnapshot.empty) {
      this.logger.log('Nenhum documento para atualizar. Todos os dados estão consistentes.');
      return;
    }

    this.logger.log(`Encontrados ${opsToFixSnapshot.size} documentos para corrigir...`);
    const batch = this.firestore.batch();

    opsToFixSnapshot.docs.forEach(doc => {
      const operation = doc.data();
      if (operation.lucro !== undefined && operation.valorCompra > 0) {
        const lucroPercentual = (operation.lucro / operation.valorCompra) * 100;
        batch.update(doc.ref, { lucroPercentual });
      }
    });

    await batch.commit();
    this.logger.log(`Backfill concluído! ${opsToFixSnapshot.size} documentos foram atualizados.`);
  }

   async cleanupClients() {
    this.logger.warn('--- INICIANDO LIMPEZA DE TODOS OS USUÁRIOS E DADOS DE CLIENTES ---');
    this.logger.warn('!!! ESTA AÇÃO É DESTRUTIVA E NÃO PODE SER DESFEITA !!!');

    // 1. Encontra todos os usuários que NÃO são administradores
    const usersToDeleteQuery = this.firestore.collection('users').where('role', '!=', 'admin');
    const usersToDeleteSnapshot = await usersToDeleteQuery.get();

    if (usersToDeleteSnapshot.empty) {
      this.logger.log('Nenhum usuário com role "client" encontrado para apagar.');
      return;
    }

    this.logger.log(`Encontrados ${usersToDeleteSnapshot.size} usuários "client" para apagar...`);

    // Usamos um WriteBatch para agrupar todas as exclusões em uma única transação
    const batch = this.firestore.batch();
    const clientIdsToDelete = usersToDeleteSnapshot.docs.map(doc => doc.id);

    // 2. Encontra e agenda a exclusão de todas as transações associadas
    this.logger.log('Buscando transações de clientes para apagar...');
    if (clientIdsToDelete.length > 0) {
        // O Firestore permite até 30 'in' queries por vez, se tiver mais que 30 clientes, precisa quebrar em lotes.
        const transactionsQuery = this.firestore.collection('client_transactions').where('clientId', 'in', clientIdsToDelete);
        const transactionsSnapshot = await transactionsQuery.get();

        if (!transactionsSnapshot.empty) {
            this.logger.log(`  - Encontradas ${transactionsSnapshot.size} transações para apagar.`);
            transactionsSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
        }
    }
    
    // 3. Agenda a exclusão dos próprios documentos dos usuários
    usersToDeleteSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // 4. Executa todas as exclusões de uma só vez
    await batch.commit();

    this.logger.log('--- LIMPEZA COMPLETA ---');
    this.logger.log(`${usersToDeleteSnapshot.size} usuários e suas transações foram apagados com sucesso.`);
  }

  // Em src/seeder/seeder.service.ts

async validatePerformanceCalculation() {
    this.logger.log('--- INICIANDO SCRIPT DE VALIDAÇÃO DE PERFORMANCE (COM DADOS EXISTENTES) ---');

    // 1. Busca todos os dados necessários (sem apagar nada)
    const [, allClientTrans, allClients] = await Promise.all([
      this.operationsService.findAll({}),
      this.transactionsService.findAll({}),
      this.clientsService.findAll(),
    ]);
    
    // 2. Seleciona o primeiro cliente ativo que tenha transações
    const targetClient = allClients.find(c => 
        c.status === 'Ativo' && allClientTrans.some(t => t.clientId === c.id)
    );

    if (!targetClient) {
      this.logger.warn('Nenhum cliente ativo com transações encontrado para validar.');
      return;
    }
    this.logger.log(`Cliente selecionado para validação: ${targetClient.name} (ID: ${targetClient.id})`);

    const clientTransactions = allClientTrans.filter(t => t.clientId === targetClient.id && t.status === 'Aprovado');
    if (clientTransactions.length === 0) {
        this.logger.warn(`Cliente ${targetClient.name} não possui transações aprovadas.`);
        return;
    }

    // 3. Pega a performance mensal do fundo
    const fundMonthlyReturns = await this.operationsService.getMonthlyReturns();
    const fundPerformanceMap = new Map(fundMonthlyReturns.map(m => [`${m.year}-${m.month}`, m.returnValue]));

    this.logger.log('\n--- Performance Mensal do Fundo (%) ---');
    console.table(fundMonthlyReturns.map(m => ({ Mês: `${m.month + 1}/${m.year}`, Rentabilidade: `${m.returnValue.toFixed(4)}%` })));

    // 4. Simula o cálculo para o cliente, mês a mês, de forma detalhada
    this.logger.log(`\n--- Simulação da Carteira de ${targetClient.name} ---`);
    
    const sortedTransactions = [...clientTransactions].sort((a, b) => a.data.getTime() - b.data.getTime());
    const firstTransactionDate = sortedTransactions[0].data;
    const simulationStartDate = new Date(firstTransactionDate.getFullYear(), firstTransactionDate.getMonth(), 1);
    
    const simulationLog = [];
    let clientBalance = 0;
    let totalAportes = 0;
    let totalResgates = 0;
    let totalRendimentos = 0;
    
    const currentDate = new Date(simulationStartDate);
    const today = new Date();

    while (currentDate <= today) {
        const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
        const previousBalance = clientBalance;

        let aportesMes = 0;
        let resgatesMes = 0;

        clientTransactions.forEach((t) => {
            if (t.data.getFullYear() === currentDate.getFullYear() && t.data.getMonth() === currentDate.getMonth()) {
                if (t.tipo === 'Aporte') {
                    aportesMes += t.valor;
                } else if (t.tipo === 'Resgate') {
                    resgatesMes += t.valor; // Soma o valor absoluto
                }
                // Transações de 'Rendimento' são ignoradas, pois estamos recalculando-as
            }
        });
        
        const netCashFlow = aportesMes - resgatesMes;
        const fundReturnPercent = fundPerformanceMap.get(monthKey) ?? 0;
        
        const effectiveBalanceForReturn = previousBalance + (netCashFlow / 2);
        const profitForMonth = effectiveBalanceForReturn * (fundReturnPercent / 100);
        
        clientBalance = previousBalance + netCashFlow + profitForMonth;
        
        // Atualiza os totais para o relatório final
        totalAportes += aportesMes;
        totalResgates += resgatesMes;
        totalRendimentos += profitForMonth;

        simulationLog.push({
            'Mês': `${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`,
            'Saldo Inicial': `R$ ${previousBalance.toFixed(2)}`,
            'Aportes': `R$ ${aportesMes.toFixed(2)}`,
            'Resgates': `R$ ${resgatesMes.toFixed(2)}`,
            'Rentab. Fundo (%)': `${fundReturnPercent.toFixed(2)}%`,
            'Lucro do Mês (R$)': `R$ ${profitForMonth.toFixed(2)}`,
            'Saldo Final': `R$ ${clientBalance.toFixed(2)}`,
        });

        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    console.table(simulationLog);

    // 5. Compara o resultado da simulação com o método oficial
    this.logger.log('\n--- VALIDAÇÃO FINAL (BATIMENTO) ---');
    const officialResult = await this.performanceService.getDashboardData(targetClient.id, 'Desde o início');
    
    const officialSaldoAtual = officialResult.cardData.saldoAtual;
    const officialRendimentoReais = officialResult.cardData.rendimentoReais;

    const saldoFinalCalculado = totalAportes - totalResgates + totalRendimentos;
    
    this.logger.log(`Total Aportado (Simulação):   R$ ${totalAportes.toFixed(2)}`);
    this.logger.log(`Total Resgatado (Simulação):  R$ ${totalResgates.toFixed(2)}`);
    this.logger.log(`Total Rendimentos (Simulação):R$ ${totalRendimentos.toFixed(2)}`);
    this.logger.log('--------------------------------------------------');
    this.logger.log(`SALDO FINAL CALCULADO (Aportes - Resgates + Rendimentos): R$ ${saldoFinalCalculado.toFixed(2)}`);
    this.logger.log(`SALDO ATUAL (Retornado pela API):                       R$ ${officialSaldoAtual.toFixed(2)}`);
    this.logger.log('\n---');
    this.logger.log(`RENDIMENTO R$ (Simulação):    R$ ${totalRendimentos.toFixed(2)}`);
    this.logger.log(`RENDIMENTO R$ (Retornado pela API): R$ ${officialRendimentoReais.toFixed(2)}`);
    
    const diffSaldo = Math.abs(saldoFinalCalculado - officialSaldoAtual);
    const diffRendimento = Math.abs(totalRendimentos - officialRendimentoReais);

    if (diffSaldo < 0.01 && diffRendimento < 0.01) {
      this.logger.log('\n✅ VALIDAÇÃO BEM-SUCEDIDA: Os saldos e rendimentos são consistentes!');
    } else {
      this.logger.error(`\n❌ VALIDAÇÃO FALHOU:`);
      if (diffSaldo >= 0.01) this.logger.error(`  - Diferença no SALDO: R$ ${diffSaldo.toFixed(2)}`);
      if (diffRendimento >= 0.01) this.logger.error(`  - Diferença no RENDIMENTO: R$ ${diffRendimento.toFixed(2)}`);
    }
  }

  async deleteAllAportesResgates() {
  this.logger.warn('--- APAGANDO TODOS APORTES E RESGATES DE TODOS CLIENTES ---');

  const snapshot = await this.firestore
    .collection('client_transactions')
    .where('tipo', 'in', ['Aporte', 'Resgate'])
    .get();

  if (snapshot.empty) {
    this.logger.log('Nenhum aporte ou resgate encontrado.');
    return;
  }

  this.logger.warn(`Encontradas ${snapshot.size} transações para apagar...`);

  const batchSize = 400; // firestore limite seguro

  let batch = this.firestore.batch();
  let ops = 0;

  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    ops++;

    // commit incremental (firestore batch tem limite ~500)
    if (ops >= batchSize) {
      batch.commit();
      batch = this.firestore.batch();
      ops = 0;
    }
  });

  if (ops > 0) {
    await batch.commit();
  }

  this.logger.log('✅ Todos aportes e resgates apagados.');
}


}
