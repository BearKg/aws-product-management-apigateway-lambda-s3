import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Product, ProductRecord } from "../../types/product";
import { v4 as uuidv4 } from "uuid";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME!;
const PRODUCT_IMAGES_BUCKET_NAME = process.env.PRODUCT_IMAGES_BUCKET_NAME!;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("Event received: ", JSON.stringify(event, null, 2));

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Request body is required",
        }),
      };
    }

    const product: Product = JSON.parse(event.body);
    if (
      !product.name ||
      !product.description ||
      typeof product.price !== "number" ||
      !product.imageData
    ) {

      return {
        statusCode: 400,
        body: JSON.stringify({
          message:
            "All fields are required: name, description, price, and image",
        }),
      };
    }

    // Generate unique ID for the product
    const productId = uuidv4();
    const timestamp = new Date().toISOString();

    // Upload image to S3
    let imageUrl: string;

    try {
      console.log("Starting S3 upload process...");
      console.log("Bucket name:", PRODUCT_IMAGES_BUCKET_NAME);

      // Extract base64 data (remove data.image/...; base64, prefix)
      const base64Data = product.imageData.replace(
        /^data:image\/[a-z]+;base64,/,
        ""
      );
      const imageBuffer = Buffer.from(base64Data, "base64");

      // Determine file extension from base64 data
      const fileExtension = product.imageData.includes("data:image/jpeg")
        ? "jpg"
        : product.imageData.includes("data:image/png")
        ? "png"
        : product.imageData.includes("data:image/gif")
        ? "gif"
        : "jpg";

      const s3Key = `products/${productId}.${fileExtension}`;

      console.log("S3 upload parameters:", {
        bucket: PRODUCT_IMAGES_BUCKET_NAME,
        key: s3Key,
        contentType: `image/${fileExtension}`,
        bufferSize: imageBuffer.length,
      });

      await s3Client.send(
        new PutObjectCommand({
          Bucket: PRODUCT_IMAGES_BUCKET_NAME,
          Key: s3Key,
          Body: imageBuffer,
          ContentType: `image/${fileExtension}`,
        })
      );

      imageUrl = `https://${PRODUCT_IMAGES_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
      console.log("Image uploaded to S3 successfully", imageUrl);
    } catch (s3Error: any) {
      console.error("Error uploading image to S3:", s3Error);
      console.log("S3 Error details", {
        message: s3Error.message,
        code: s3Error.code,
        statusCode: s3Error.statusCode,
        requestId: s3Error.requestId,
        bucketName: PRODUCT_IMAGES_BUCKET_NAME,
      });
      console.log("S3 Error:", s3Error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to upload image",
          error: s3Error.message,
        }),
      };
    }

    // Create product record for DynamoDB
    const productRecord: ProductRecord = {
      id: productId,
      name: product.name,
      description: product.description,
      price: product.price,
      imageUrl: imageUrl,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: PRODUCTS_TABLE_NAME,
          Item: productRecord,
        })
      );
      console.log("Product stored in DynamoDB:", productId);
    } catch (dynamoError) {
      console.log("Error storing product in DynamoDB:", dynamoError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to store product",
        }),
      };
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Product created successfully",
        product: productRecord,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
      }),
    };
  }
};
