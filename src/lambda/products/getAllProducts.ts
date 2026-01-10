import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ProductRecord } from '../../types/product';

const dynamoClient = new DynamoDBClient({});
// Tự động convert JS object ↔ DynamoDB AttributeValue
// Cho phép dùng object JavaScript bình thường
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  console.log('Event received: ', JSON.stringify(event, null, 2));

  try {
    // Scan DynamoDB table to get all products
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: PRODUCTS_TABLE_NAME,
      })
    )

    const products: ProductRecord[] = (scanResult.Items as ProductRecord[]) || [] 

    // Sort products by creation date (newest first)
    products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    console.log(`Retrieved ${products.length} products from DynamoDB`);
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify(products),
    }

  } catch (error) {
    console.error('Error retrieving products:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error',
      })
    }
  }
};