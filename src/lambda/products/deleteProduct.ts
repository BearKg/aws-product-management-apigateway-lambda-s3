import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  console.log('Event: ', event);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'delete product' }),
  };
};