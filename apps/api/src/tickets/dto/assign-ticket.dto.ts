import { IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignTicketDto {
  @ApiProperty()
  @IsUUID()
  assigneeId: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  teamId?: string;
}
