//AWS configurations
import { S3Client } from "@aws-sdk/client-s3";
// import { putResData } from './put.mjs';
// import { getResData } from './get.mjs';
import { deleteResData } from './delete.mjs';

const TenantId = process.env.TENANT_ID;

const client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event) => {

	console.info("EVENT\n" + JSON.stringify(event, null, 2))
	console.log('event.requestContext.http.method: ', event.requestContext.http.method);

	const headers = {
		'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,X-Requested-With',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'OPTIONS,DELETE',
	};

	const response = (statusCode = 200, body) => {
		const res = {
			statusCode,
			headers,
			body,
		};

		console.log('return with:', res);
		return res;
	};

	const Bucket = process.env.BUCKET;
    const Prefix = `static/${process.env.SERVICE_NAME}/${TenantId}/spmetadata`;
	const FileName = event.pathParameters?.id;

	try {
		switch (event.requestContext.http.method) {
			// case 'GET':
			// 	const getResult = await getResData(event.pathParameters?.id, samlurl);
			// 	return response(200, JSON.stringify({ data: getResult }));
			// case 'PUT':
			// 	const payload = JSON.parse(event.body);
			// 	const putResult = await putResData(payload.data, samlurl, '', '', samlReloadUrl);
			// 	return response(200, JSON.stringify({ data: putResult }));
			case 'DELETE':
				const deleteResult = await deleteResData({ Bucket, Prefix, FileName }, client);
				return response(200, JSON.stringify({ data: deleteResult }));
			case 'OPTIONS':
				return response(200, JSON.stringify({ data: 'ok' }));
			default:
				return response(404, JSON.stringify({ data: 'Not Found' }));
		}
	}
	catch (e) {
		console.log('Catch an error: ', e)
	}

	return {
		statusCode: 500,
		headers,
		body: JSON.stringify({ type: 'exception', message: 'Service Error' }),
	};
}


