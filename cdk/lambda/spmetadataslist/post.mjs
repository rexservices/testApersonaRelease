//AWS configurations
import { PutObjectCommand } from "@aws-sdk/client-s3";


export const postResData = async (payload, client ) => {
	const {Bucket, Body, Prefix, Name, FileName, serviceUrl, logoUrl} = payload;

	const Key = `${Prefix}/${FileName}`;

	const command = new PutObjectCommand({
		Bucket,
		Body,
		Key,
	});

	await client.send(command);

	const url = `https://${process.env.S3_BASE_URL}/${Prefix}/${FileName}`;

	return {
		id: FileName,
		name: Name,
		metadataType: 'isFile',
		metadataUrl: url,
		serviceUrl,
		logoUrl,
	}

}

export default postResData;