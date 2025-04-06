//AWS configurations
import { DeleteObjectCommand } from "@aws-sdk/client-s3";


export const deleteResData = async (payload, client ) => {
	const {Bucket, Prefix, FileName} = payload;

	const Key = `${Prefix}/${FileName}`;

	const command = new DeleteObjectCommand({
		Bucket,
		Key,
	});

	const response = await client.send(command);

	const url = `${process.env.S3_BASE_URL}${Prefix}/${FileName}`;

	return {
		id: FileName,
		url,
	}

}