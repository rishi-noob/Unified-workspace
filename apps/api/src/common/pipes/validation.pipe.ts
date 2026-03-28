import { ValidationPipe as NestValidationPipe, BadRequestException } from '@nestjs/common';

export const AppValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  exceptionFactory: (errors) => {
    const messages = errors.map((error) => {
      const constraints = error.constraints
        ? Object.values(error.constraints)
        : ['Invalid value'];
      return {
        field: error.property,
        messages: constraints,
      };
    });
    return new BadRequestException({
      message: 'Validation failed',
      errors: messages,
    });
  },
});
