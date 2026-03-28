export const rabbitmqConfig = () => ({
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
});
