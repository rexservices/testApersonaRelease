import {
	PutItemCommand,
} from '@aws-sdk/client-dynamodb';

export const postResData = async (payload, dynamodb) => {
	console.log('putResData Input:', payload);

	const params = {
		Item: {
			id: {
				S: payload.id,
			},
			name: {
				S: payload.name,
			},
			contact: {
				S: payload.contact,
			},
			url: {
				S: payload.url,
			},
			endUserSpUrl: {
				S: payload.endUserSpUrl,
			},
			samlproxy: {
				BOOL: payload.samlproxy
			}
		},
		ReturnConsumedCapacity: 'TOTAL',
		TableName: process.env.AMFATENANT_TABLE,
	};

	const item = await dynamodb.send(new PutItemCommand(params));

	if (item) {

		return {
			id: item.id,
			name: decodeURIComponent(item.name),
			contact: item.contact,
			samlproxy: item.samlproxy,
			url: item.url,
		}
	}

	return null;
}

export default postResData;