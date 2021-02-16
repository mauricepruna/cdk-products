import * as cdk from '@aws-cdk/core';
import * as cognito from '@aws-cdk/aws-cognito';
import * as appsync from '@aws-cdk/aws-appsync';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';

export class CdkProductsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, 'cdk-products-user-pool', {
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.PHONE_WITHOUT_MFA_AND_EMAIL,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
    });

    const api = new appsync.GraphqlApi(this, 'cdk-product-app', {
      name: 'cdk-product-api',
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
      schema: appsync.Schema.fromAsset('.graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(365)),
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.USER_POOL,
            userPoolConfig: {
              userPool,
            },
          },
        ],
      },
    });

    const productLambda = new lambda.Function(this, 'AppSyncProductHandler', {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'main.handler',
      code: lambda.Code.fromAsset('lambda-fns'),
      memorySize: 1024,
    });

    //Set the new Lambda function as data source for the APPSync API.
    const lambdaDs = api.addLambdaDataSource('lambdaDataSource', productLambda);

    lambdaDs.createResolver({
      typeName: 'Query',
      fieldName: 'getProductById',
    });

    lambdaDs.createResolver({
      typeName: 'Query',
      fieldName: 'listProducts',
    });
    lambdaDs.createResolver({
      typeName: 'Query',
      fieldName: 'productsByCatergory',
    });

    lambdaDs.createResolver({
      typeName: 'Mutation',
      fieldName: 'createProduct',
    });

    lambdaDs.createResolver({
      typeName: 'Mutation',
      fieldName: 'deleteProduct',
    });

    lambdaDs.createResolver({
      typeName: 'Mutation',
      fieldName: 'updateProduct',
    });

    const productTable = new dynamodb.Table(this, 'CDKProductTable', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });

    productTable.addGlobalSecondaryIndex({
      indexName: 'productsByCatergory',
      partitionKey: {
        name: 'category',
        type: dynamodb.AttributeType.STRING,
      },
    });

    productTable.grantFullAccess(productLambda);

    productLambda.addEnvironment('PRODUCT_TABLE', productTable.tableName);

    new cdk.CfnOutput(this, 'GraphQLAPIUrl', {
      value: api.graphqlUrl,
    });

    new cdk.CfnOutput(this, 'AppSyncAPIKey', {
      value: api.apiKey || '',
    });

    new cdk.CfnOutput(this, 'ProjectRegion', {
      value: this.region,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
  }
}
