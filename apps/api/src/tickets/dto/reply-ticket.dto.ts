import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyTicketDto {
  @ApiProperty({ example: 'We are looking into your VPN issue and will update you shortly.' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
