import postResData from "./post.mjs";

//AWS configurations
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {

    console.info("EVENT\n" + JSON.stringify(event, null, 2))

    let errMsg = { type: 'exception', message: 'Service Error' };

    try {

        if (event.requestContext.http.method === 'POST' && (!event.queryStringParameters || !event.queryStringParameters.page)) {
            // invite new user
            const body = JSON.parse(event.body);
            console.log('POST data: ', body);
            const postResult = await postResData(body.data, dynamodb);

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
                ConsistentRead: true,
                ReturnConsumedCapacity: 'TOTAL',
                TableName: process.env.AMFATENANT_TABLE,
            }

            console.info('params', params);

            let data = await dynamodb.send(new ScanCommand(params));
            NextToken = data.LastEvaluatedKey

            let resData = [];
            console.log ('fetched data:', data);
            if (data && data.Items && data.Items.length > 0) {
                resData = data.Items.map(item => {
                    return {
                        id: item.id.S,
                        name: decodeURIComponent(item.name.S),
                        contact: item.contact.S,
                        url: item.url.S,
                        endUserSpUrl: item.endUserSpUrl.S,
                        samlproxy: item.samlproxy?.BOOL,
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
