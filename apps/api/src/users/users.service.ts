import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../common/password.util';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(`User with email '${dto.email}' already exists`);
    }

    const user = this.usersRepository.create({
      email: dto.email,
      name: dto.name,
      passwordHash: await hashPassword(dto.password, this.BCRYPT_ROUNDS),
      role: dto.role,
      departmentIds: JSON.stringify(dto.departmentIds || []),
    });

    return this.usersRepository.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');

    if (dto.name) user.name = dto.name;
    if (dto.email) user.email = dto.email;
    if (dto.role) user.role = dto.role;
    if (dto.departmentIds) user.departmentIds = JSON.stringify(dto.departmentIds);
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) {
      user.passwordHash = await hashPassword(dto.password, this.BCRYPT_ROUNDS);
    }

    return this.usersRepository.save(user);
  }

  async updateRole(id: string, role: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.role = role as any;
    return this.usersRepository.save(user);
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.isActive = false;
    await this.usersRepository.save(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async setRefreshToken(id: string, token: string | null): Promise<void> {
    await this.usersRepository.update(id, { refreshToken: token });
  }
}
