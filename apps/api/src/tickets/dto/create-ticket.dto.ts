import {
  IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength, IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TicketPriority, TicketChannel } from '../../common/types/ticket-status.enum';

export class CreateTicketDto {
  @ApiProperty({ example: 'VPN not connecting' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject: string;

  @ApiProperty({ example: 'Cannot connect to VPN since morning' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: TicketPriority, default: TicketPriority.NORMAL })
  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @ApiProperty({ enum: TicketChannel, default: TicketChannel.MANUAL })
  @IsEnum(TicketChannel)
  @IsOptional()
  channel?: TicketChannel;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;
}
