import {
	DynamoDBClient,
	GetItemCommand,
} from '@aws-sdk/client-dynamodb';

import { CognitoIdentityProviderClient, DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const headers = {
	'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,X-Requested-With',
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'OPTIONS,GET',
};

const response = (statusCode = 200, body) => {
	console.log('return with:', {
		statusCode,
		headers,
		body,
	});
	return {
		statusCode,
		headers,
		body,
	};
};


const configs = ['amfaConfigs', 'amfaPolicies'];

export const handler = async (event) => {

	console.info("EVENT\n" + JSON.stringify(event, null, 2))

	let promises = [];

	configs.forEach(configType => {
		const params = {
			TableName: process.env.AMFACONFIG_TABLE,
			Key: {
				configtype: { S: configType },
			},
		};
		promises.push(dynamodb.send(new GetItemCommand(params)));
	});

	const params = {
		TableName: process.env.AMFATENANT_TABLE,
		Key: {
			id: { S: process.env.TENANT_ID },
		},
	};

	promises.push(dynamodb.send(new GetItemCommand(params)));

	promises.push(cognito.send(new DescribeUserPoolCommand({
		UserPoolId: process.env.USERPOOL_ID,
	})));

	const [configRes, policyRes, samlRes, cognitoRes] = await Promise.allSettled(promises);

	console.log('samlres', samlRes);
	console.log('cognitores', cognitoRes);

	if (configRes.status === 'rejected' || policyRes.status === 'rejected' || samlRes.status === 'rejected' || cognitoRes.status === 'rejected') {
		console.log('configres', configRes);
		console.log('policyres', policyRes);
		console.log('samlres', samlRes);
		console.log('cognitores', cognitoRes);
		return response(500, JSON.stringify({ error: 'Internal server error' }));
	}

	return response(200, JSON.stringify({
		amfaConfigs: JSON.parse(configRes.value.Item.value.S),
		amfaPolicies: JSON.parse(policyRes.value.Item.value.S),
		samlProxyEnabled: samlRes.value.Item?.samlproxy?.BOOL,
		totalUserNumber: cognitoRes.value.UserPool.EstimatedNumberOfUsers,
	}));

}