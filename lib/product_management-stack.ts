import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambdaRuntime from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2_integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ProductManagementStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Create DynamoDB table for products
    const productsTable = new dynamodb.Table(
      this,
      `${this.stackName}-Products-Table`,
      {
        tableName: `${this.stackName}-Products-Table`,
        partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    const productImagesBucket = new s3.Bucket(
      this,
      `${this.stackName}-Product_images_Bucket`,
      {
        // need to be lowercase
        bucketName: `${this.stackName.toLocaleLowerCase()}-images-vanhuynh-${new Date().getTime()}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      }
    );

    const createProductLambda = new NodejsFunction(
      this,
      `${this.stackName}-create-product-lambda`,
      {
        runtime: lambdaRuntime.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(__dirname, "../src/lambda/products/createProduct.ts"),
        functionName: `${this.stackName}-create-product-lambda`,
        environment: {
          PRODUCTS_TABLE_NAME: productsTable.tableName,
          PRODUCT_IMAGES_BUCKET_NAME: productImagesBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(20),
      }
    );

    const getAllProductLambda = new NodejsFunction(
      this,
      `${this.stackName}-get-all-products-lambda`,
      {
        runtime: lambdaRuntime.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(__dirname, "../src/lambda/products/getAllProducts.ts"),
        environment: {
          PRODUCTS_TABLE_NAME: productsTable.tableName,
        },
      }
    );

    const deleteProductLambda = new NodejsFunction(
      this,
      `${this.stackName}-delete-product-lambda`,
      {
        runtime: lambdaRuntime.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(__dirname, "../src/lambda/products/deleteProduct.ts"),
        environment: {
          PRODUCT_TABLE_NAME: productsTable.tableName,
          PRODUCT_IMAGES_BUCKET_NAME: productImagesBucket.bucketName,
        },
      }
    );

    // Grant permissions to Lambda functions
    productsTable.grantWriteData(createProductLambda);
    productsTable.grantReadData(getAllProductLambda);
    productsTable.grantReadWriteData(deleteProductLambda);

    // Grant S3 permissions
    productImagesBucket.grantWrite(createProductLambda);
    productImagesBucket.grantWrite(deleteProductLambda);

    // Crete API Gateway V2
    const api = new apigatewayv2.HttpApi(this, `${this.stackName}-Api`, {
      apiName: `${this.stackName}-Api`,
      corsPreflight: {
        allowHeaders: ["*"],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowOrigins: ["*"],
      },
    });

    api.addRoutes({
      path: "/products",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2_integrations.HttpLambdaIntegration(
        "CreateProductIntegration",
        createProductLambda
      ),
    });

    api.addRoutes({
      path: "/products",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2_integrations.HttpLambdaIntegration(
        "GetAllProductsIntegration",
        getAllProductLambda
      ),
    });

    api.addRoutes({
      path: "/products/{id}",
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new apigatewayv2_integrations.HttpLambdaIntegration(
        "DeleteProductIntegration",
        deleteProductLambda
      ),
    });

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: api.url!,
      description: "API Gateway URL for the products API",
      exportName: `${this.stackName}-APIGateWayUrl`,
    });

    new cdk.CfnOutput(this, "ProductsTableName", {
      value: productsTable.tableName,
      description: "DynamoDB table name for products",
      exportName: `${this.stackName}-Products-TableName`,
    });

    new cdk.CfnOutput(this, "ProductImageBucketName", {
      value: productImagesBucket.bucketName,
      description: "S3 bucket name for product images",
      exportName: `${this.stackName}-Product-Images-BucketName`,
    });
  }
}
