import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ProductRecord } from "../../types/product";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;
const PRODUCT_IMAGES_BUCKET_NAME = process.env.PRODUCT_IMAGES_BUCKET_NAME;
// Initialize AWS clients
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("Event received: ", JSON.stringify(event, null, 2));
  try {
    // Get product ID from path parameters
    const productId = event.pathParameters?.id;

    if (!productId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Product ID is required",
        }),
      };
    }
    let product: ProductRecord | undefined;
    try {
      const getResult = await docClient.send(
        new GetCommand({
          TableName: PRODUCTS_TABLE_NAME,
          Key: {
            id: productId,
          },
        })
      );

      if (!getResult.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            message: "Product not found",
          }),
        };
      }
      product = getResult.Item as ProductRecord;
    } catch (dynamoError) {
      console.error("Error retrieving product from DynamoDB: ", dynamoError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to retrieve product",
        }),
      };
    }

    // Delete image from S3 of it exists
    if (product.imageUrl) {
      try {
        // Extract S3 key from the URL
        const urlParts = product.imageUrl.split("/");
        const s3Key = urlParts.slice(3).join("/"); // Remove https://bucket-name.s3.amazonaws.com/
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: PRODUCT_IMAGES_BUCKET_NAME,
            Key: s3Key,
          })
        );
        console.log("Image deleted from S3: ", s3Key);
      } catch (s3Error) {
        console.error("Error deleting image from S3:", s3Error);
        // Continue with product deletion even if image deletion fails
      }
    }

    // Delete product from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: PRODUCTS_TABLE_NAME,
          Key: { id: productId },
        })
      );

      console.log("Product deleted from DynamoDB:", productId);
    } catch (dynamoError) {
      console.error("Error deleting product from DynamoDB:", dynamoError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to delete product",
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Product deleted successfully",
        productId: productId,
      }),
    };
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
      }),
    };
  }
};
