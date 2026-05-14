import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Operator } from '@prisma/client';

import type { CreateOperatorDto, OperatorView, UpdateOperatorDto } from './dto/operators.dto';
import { OperatorsRepository } from './operators.repository';

@Injectable()
export class OperatorsService {
  constructor(private readonly repository: OperatorsRepository) {}

  async createForUser(userId: string, dto: CreateOperatorDto): Promise<OperatorView> {
    const existingForUser = await this.repository.findByUserId(userId);
    if (existingForUser) {
      throw new ConflictException('User already has an operator profile.');
    }

    const callsignTaken = await this.repository.findByCallsign(dto.callsign);
    if (callsignTaken) {
      throw new ConflictException('Callsign already in use.');
    }

    const created = await this.repository.create({
      userId,
      callsign: dto.callsign,
      bio: dto.bio,
      emergencyContact: dto.emergencyContact,
      ...(dto.bloodType !== undefined ? { bloodType: dto.bloodType } : {}),
    });
    return this.toView(created);
  }

  async getByUserId(userId: string): Promise<OperatorView> {
    const operator = await this.repository.findByUserId(userId);
    if (!operator) {
      throw new NotFoundException('No operator profile for this user.');
    }
    return this.toView(operator);
  }

  async getById(id: string): Promise<OperatorView> {
    const operator = await this.repository.findById(id);
    if (!operator) {
      throw new NotFoundException('Operator not found.');
    }
    return this.toView(operator);
  }

  async updateForUser(userId: string, dto: UpdateOperatorDto): Promise<OperatorView> {
    const current = await this.repository.findByUserId(userId);
    if (!current) {
      throw new NotFoundException('No operator profile for this user.');
    }

    if (dto.callsign && dto.callsign !== current.callsign) {
      const collision = await this.repository.findByCallsign(dto.callsign);
      if (collision && collision.id !== current.id) {
        throw new ConflictException('Callsign already in use.');
      }
    }

    const updated = await this.repository.updateById(current.id, {
      ...(dto.callsign !== undefined ? { callsign: dto.callsign } : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      ...(dto.emergencyContact !== undefined ? { emergencyContact: dto.emergencyContact } : {}),
      ...(dto.bloodType !== undefined ? { bloodType: dto.bloodType } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    return this.toView(updated);
  }

  private toView(o: Operator): OperatorView {
    return {
      id: o.id,
      callsign: o.callsign,
      bio: o.bio,
      emergencyContact: o.emergencyContact,
      bloodType: o.bloodType,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}
