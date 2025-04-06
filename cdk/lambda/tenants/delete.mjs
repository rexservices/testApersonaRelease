import {
	DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';

export const deleteResData = async (payload, dynamodb) => {

	const params = {
		TableName: process.env.AMFATENANT_TABLE,
		Key: {
			uuid: { S: payload.id },
		},
	};

	await dynamodb.send(new DeleteItemCommand(params));
	//todo: de-board tenant
	return {
		id: payload.id,
	};

};

export default deleteResData;