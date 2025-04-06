//AWS configurations
import {
	ListUserPoolClientsCommand,
	DescribeUserPoolClientCommand,
	CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import postResData from "./post.mjs";

const dynamodbISP = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoISP = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const Limit = 60;

export const handler = async (event) => {

	console.info("EVENT\n" + JSON.stringify(event, null, 2))

	let errMsg = { type: 'exception', message: 'Service Error' };

	try {

		if (event.requestContext.http.method === 'POST' && (!event.queryStringParameters || !event.queryStringParameters.page)) {
			// invite new user
			const body = JSON.parse(event.body);
			console.log('POST data: ', body);
			const postResult = await postResData(body.data, cognitoISP, dynamodbISP);

			return {
				statusCode: 200,
				headers: {
					'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
					'Access-Control-Expose-Headers': 'Content-Range',
					'Content-Type': 'application/json',
					'Access-Control-Allow-Credentials': true,
				},
				body: JSON.stringify({ data: postResult }),
			};
		}
		else {
			let NextToken = event.body ? event.body : "";

			const params = {
				Limit,
				...(event.body && { NextToken: event.body }), // tokens[1] contain the token query for page 1.
				UserPoolId: process.env.USERPOOL_ID,
			}

			console.info('params', params);

			let data = await cognitoISP.send(new ListUserPoolClientsCommand(params));
			NextToken = data.NextToken

			let resData = [];
			if (data?.UserPoolClients && data.UserPoolClients.length > 0) {
				const res = data.UserPoolClients.filter(
					appclient =>
						appclient.ClientName !== 'hostedUIClient' &&
						appclient.ClientName !== 'customAuthClient' &&
						appclient.ClientName !== 'samlproxyClient' &&
						!appclient.ClientName.startsWith('amfasys_'));
				for (const item of res) {
					const clientData = await cognitoISP.send(new DescribeUserPoolClientCommand({
						ClientId: item.ClientId, UserPoolId: process.env.USERPOOL_ID
					}));
					resData.push({
						id: item.ClientId,
						clientName: item.ClientName,
						clientId: item.ClientId,
						userPoolId: item.UserPoolId,
						creationDate: clientData.UserPoolClient.CreationDate,
						lastModifiedDate: clientData.UserPoolClient.LastModifiedDate,
					});
				}
			}

			// getList of React-admin expects response to have header called 'Content-Range'.
			// when we add new header in response, we have to acknowledge it, so 'Access-Control-Expose-Headers'
			const page = parseInt(event.queryStringParameters.page);
			const perPage = parseInt(event.queryStringParameters.perPage);
			const start = (page - 1) * perPage;
			const end = resData.length + start - 1;

			resData.sort((a, b) => {
                if (a.id < b.id) return -1;
                if (a.id > b.id) return 1;
                return 0;
            });

			return {
				statusCode: 200,
				headers: {
					'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
					'Access-Control-Expose-Headers': 'Content-Range',
					'Content-Range': `groups ${start}-${end}`,
				},
				body: JSON.stringify({
					data: resData,
					total: resData.length,
					...(NextToken && { PaginationToken: NextToken }),
				}),
			}
		}
	} catch (e) {
		console.log('Catch an error: ', e)
		switch (e.name) {
			case 'ThrottlingException':
				errMsg = { type: 'exception', message: 'Too many requests' };
				break;
			case 'InvalidParameterValue':
			case 'InvalidParameterException':
				errMsg = { type: 'exception', message: 'Invalid parameter' };
				break;
			default:
				errMsg = { type: 'exception', message: 'Service Error' };
				break;
		}
	}
	// TODO implement
	const response = {
		statusCode: 500,
		body: JSON.stringify(errMsg),
	};
	return response;
};
