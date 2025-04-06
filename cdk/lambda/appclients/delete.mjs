
//AWS configurations
import { DeleteUserPoolClientCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';

export const deleteResData = async (ClientId, cognitoISP, dynamodb) => {
	const params = {
		ClientId,
		UserPoolId: process.env.USERPOOL_ID,
	};

	const result = await cognitoISP.send(new DeleteUserPoolClientCommand(params));
	try {
		await dynamodb.send(new DeleteItemCommand({
			TableName: process.env.AMFA_SPINFO_TABLE,
			Key: {
				id: { S: '#OIDC#' + ClientId },
			},
		}));
	}
	catch (err) {
		console.log('delete appclient spinfo in dynamodb error', err);
	}

	console.log('delete appclient result', result);

	return {
		id: ClientId,
	};

};

export default deleteResData;