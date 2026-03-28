import { IsString, IsOptional, IsEnum, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus, TicketPriority } from '../../common/types/ticket-status.enum';

export class UpdateTicketDto {
  @ApiProperty({ enum: TicketStatus, required: false })
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @ApiProperty({ enum: TicketPriority, required: false })
  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}
