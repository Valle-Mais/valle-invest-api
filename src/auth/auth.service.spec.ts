import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService, MUST_SET_PASSWORD } from './auth.service';
import { hashPassword } from './password';
import { Client } from '../clients/entities/client.entity';

describe('AuthService', () => {
  let service: AuthService;
  let hash: string;

  const users = {
    findRawByEmail: jest.fn(),
    findRawById: jest.fn(),
    setAuthFields: jest.fn(),
    findAll: jest.fn(),
  };
  const jwt = { sign: jest.fn().mockReturnValue('jwt-token') };
  const mail = {
    linkTo: jest.fn(
      (path: string, token: string) => `http://front/${path}?token=${token}`,
    ),
    sendInvite: jest.fn(),
    sendPasswordReset: jest.fn(),
    sendMagicLink: jest.fn(),
  };
  const tokens = {
    issue: jest.fn().mockResolvedValue('raw-token'),
    consume: jest.fn(),
    invalidateAll: jest.fn(),
  };

  const baseUser = (): Client => ({
    id: 'u1',
    name: 'Maria',
    email: 'maria@x.com',
    joinDate: new Date(),
    status: 'Ativo',
    role: 'client',
    totalInvestido: 0,
  });

  beforeAll(async () => {
    hash = await hashPassword('Senha123');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      users as never,
      jwt as never,
      mail as never,
      tokens as never,
    );
  });

  describe('login', () => {
    it('401 para email desconhecido', async () => {
      users.findRawByEmail.mockResolvedValue(undefined);
      await expect(service.login('x@x.com', 'qualquer')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('403 MUST_SET_PASSWORD quando ainda não há senha', async () => {
      users.findRawByEmail.mockResolvedValue({
        ...baseUser(),
        mustSetPassword: true,
      });
      const err = await service.login('maria@x.com', 'x').catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ code: MUST_SET_PASSWORD });
    });

    it('401 para senha errada', async () => {
      users.findRawByEmail.mockResolvedValue({
        ...baseUser(),
        passwordHash: hash,
      });
      await expect(
        service.login('maria@x.com', 'Errada123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('devolve token e usuário sem passwordHash', async () => {
      users.findRawByEmail.mockResolvedValue({
        ...baseUser(),
        passwordHash: hash,
      });
      const session = await service.login('maria@x.com', 'Senha123');
      expect(session.access_token).toBe('jwt-token');
      expect(session.user).not.toHaveProperty('passwordHash');
      expect(jwt.sign).toHaveBeenCalledWith({
        email: 'maria@x.com',
        sub: 'u1',
        role: 'client',
      });
    });
  });

  describe('forgotPassword', () => {
    it('resolve sem enviar nada para email desconhecido', async () => {
      users.findRawByEmail.mockResolvedValue(undefined);
      await expect(service.forgotPassword('x@x.com')).resolves.toBeUndefined();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
      expect(mail.sendInvite).not.toHaveBeenCalled();
    });

    it('envia reset para quem já tem senha', async () => {
      users.findRawByEmail.mockResolvedValue({
        ...baseUser(),
        passwordHash: hash,
      });
      await service.forgotPassword('maria@x.com', 'http://origin');
      expect(tokens.invalidateAll).toHaveBeenCalledWith('u1', ['reset']);
      expect(tokens.issue).toHaveBeenCalledWith('u1', 'reset');
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'maria@x.com',
        'Maria',
        'http://front/definir-senha?token=raw-token',
      );
    });

    it('envia convite para quem nunca definiu senha', async () => {
      users.findRawByEmail.mockResolvedValue({
        ...baseUser(),
        mustSetPassword: true,
      });
      await service.forgotPassword('maria@x.com');
      expect(mail.sendInvite).toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('grava hash, zera mustSetPassword e invalida os demais tokens', async () => {
      tokens.consume.mockResolvedValue({ userId: 'u1', type: 'invite' });
      await service.resetPassword('raw', 'NovaSenha1');
      expect(tokens.consume).toHaveBeenCalledWith('raw', ['invite', 'reset']);
      const fields = users.setAuthFields.mock.calls[0][1];
      expect(fields.mustSetPassword).toBe(false);
      expect(fields.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(tokens.invalidateAll).toHaveBeenCalledWith('u1');
    });
  });

  describe('changePassword', () => {
    it('exige a senha atual correta', async () => {
      users.findRawById.mockResolvedValue({
        ...baseUser(),
        passwordHash: hash,
      });
      await expect(
        service.changePassword('u1', 'Errada123', 'NovaSenha1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.setAuthFields).not.toHaveBeenCalled();
    });

    it('troca a senha e invalida tokens', async () => {
      users.findRawById.mockResolvedValue({
        ...baseUser(),
        passwordHash: hash,
      });
      await service.changePassword('u1', 'Senha123', 'NovaSenha1');
      expect(users.setAuthFields).toHaveBeenCalled();
      expect(tokens.invalidateAll).toHaveBeenCalledWith('u1');
    });
  });

  describe('sendInvite', () => {
    it('marca mustSetPassword, invalida convites antigos e envia o link', async () => {
      users.findRawById.mockResolvedValue(baseUser());
      await service.sendInvite('u1');
      expect(users.setAuthFields).toHaveBeenCalledWith('u1', {
        mustSetPassword: true,
      });
      expect(tokens.invalidateAll).toHaveBeenCalledWith('u1', ['invite']);
      expect(mail.sendInvite).toHaveBeenCalledWith(
        'maria@x.com',
        'Maria',
        'http://front/definir-senha?token=raw-token',
      );
    });
  });
});
