//AWS configurations
import {
    ListObjectsV2Command,
    S3Client,
} from "@aws-sdk/client-s3";

import postResData from "./post.mjs";

const TenantId = process.env.TENANT_ID;

const client = new S3Client({ region: process.env.AWS_REGION });

const headers = {
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
    'Access-Control-Expose-Headers': 'Content-Range',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Credentials': true,
}

export const handler = async (event) => {

    console.info("EVENT\n" + JSON.stringify(event, null, 2))

    let errMsg = { type: 'exception', message: 'Service Error' };

    // todo: multi-tenants -> retreive from token

    const Bucket = process.env.BUCKET;
    const Prefix = `static/${process.env.SERVICE_NAME}/${TenantId}/spmetadata`;

    try {

        // list all metadata files
        if (event.requestContext.http.method === 'POST') {
            const body = JSON.parse(event.body);
            console.log('POST data: ', body);

            const postRes = await postResData(
                {
                    Body: body.data.metadata, Name: body.data.name, Bucket, Prefix, FileName: body.data.fileName,
                    serviceUrl: body.data.serviceUrl, logoUrl: body.data.logoUrl,
                },
                client
            );

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ data: postRes }),
            };

        }

        // list all metadata files,
        if (event.requestContext.http.method === 'GET') {
            // max 1000
            const command = new ListObjectsV2Command({ Bucket, Prefix });
            command.input.ContinuationToken = event.body ? event.body : "";

            console.log("Your bucket contains the following objects:\n");

            const { Contents, NextContinuationToken } = await client.send(command);

            console.log('list bucket objects, res', Contents);

            let resData = [];
            if (Contents && Contents.length > 0) {
                resData = Contents.map(item => {
                    return {
                        id: item.Key,
                        lastModifiedDate: item.LastModified,
                        // long timeStamp = s3Object.lastModified().getEpochSecond() * 1000;
                    }
                });
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
                    ...(NextContinuationToken && { PaginationToken: NextContinuationToken }),
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
