//AWS configurations

import {
	DescribeUserPoolCommand,
	CognitoIdentityProviderClient,
	ListUsersCommand,
	ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import postResData from "./post.mjs";
import getResData from "./get.mjs";

const cognitoISP = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });


export const handler = async (event) => {

	console.info("EVENT\n" + JSON.stringify(event, null, 2))

	//To get the list of Users in aws Cognito
	let params = {}
	let filter = {}
	let filterString = ''

	let errMsg = { type: 'exception', message: 'Service Error' };

	try {
		if (event.requestContext.http.method === 'POST' && (!event.queryStringParameters || !event.queryStringParameters.page)) {
			// invite new user
			const body = JSON.parse(event.body);
			console.log('POST data: ', body);
			const postResult = await postResData(body.data, cognitoISP);

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
			let PaginationToken = null;

			if (event.queryStringParameters &&
				event.queryStringParameters.page &&
				parseInt(event.queryStringParameters.page) > 1 &&
				event.body) {
				PaginationToken = event.body;
			}

			if (event.queryStringParameters &&
				event.queryStringParameters.page &&
				parseInt(event.queryStringParameters.page) > 1 &&
				!event.body) {
				const start = (parseInt(event.queryStringParameters.page) - 1) * parseInt(event.queryStringParameters.perPage) + 1;
				return {
					statusCode: 200,
					headers: {
						'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With',
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
						'Access-Control-Expose-Headers': 'Content-Range',
						'Content-Range': `users ${start}-${start}/${0}`,
					},
					body: JSON.stringify({
						data: [],
						pageInfo: {
							hasPreviousPage: true,
							hasNextPage: false,
						},
						PaginationToken: null
					}),
				};
			}

			let listUsersData = {};
			let usersCount = 0;
			if (event.queryStringParameters && event.queryStringParameters.filter) {
				filter = JSON.parse(event.queryStringParameters.filter)
			}

			if (Object.keys(filter).includes('groups')) {
				params = {
					UserPoolId: process.env.USERPOOL_ID,
					Limit: parseInt(event.queryStringParameters.perPage), // No of users to display per page
					GroupName: filter['groups'],
					...(PaginationToken && { NextToken: PaginationToken }),
				}

				listUsersData = await cognitoISP.send(new ListUsersInGroupCommand(params));
				PaginationToken = listUsersData.NextToken;
				usersCount = listUsersData.Users.length;
			}
			else {
				if (Object.keys(filter).includes('given_name')) {
					filterString = "given_name ^= \"" + filter['given_name'] + "\""
				}

				if (Object.keys(filter).includes('family_name')) {
					filterString = "family_name ^= \"" + filter['family_name'] + "\""
				}

				if (Object.keys(filter).includes('email')) {
					filterString = "email ^= \"" + filter['email'] + "\""
				}

				console.log('filterString', filterString);
				console.log('filter', filter);
				//Saving the Pagination token for each page in obj

				params = {
					UserPoolId: process.env.USERPOOL_ID,
					Limit: parseInt(event.queryStringParameters.perPage), // No of users to display per page
					...(PaginationToken && { PaginationToken: PaginationToken }), // tokens[1] contain the token query for page 1.
					...(filterString && { Filter: filterString })
				};

				console.info('params', params);
				// Get total count of user
				const describeData = await cognitoISP.send(new DescribeUserPoolCommand({ UserPoolId: process.env.USERPOOL_ID }));
				console.log('describeUserpool result', describeData);
				usersCount = describeData.UserPool.EstimatedNumberOfUsers;

				listUsersData = await cognitoISP.send(new ListUsersCommand(params));
				console.log('listUser result', listUsersData);
				// If no remaining users are there, no paginationToken is returned from cognito
				PaginationToken = listUsersData.PaginationToken;
			}


			let resData = [];
			const page = parseInt(event.queryStringParameters.page);
			const perPage = parseInt(event.queryStringParameters.perPage);
			const start = (page - 1) * perPage + 1;
			const end = resData.length + start - 1;

			try {
				const transform = async (users) => {
					return Promise.all(users.map(item => getResData(item, cognitoISP)))
				}
				resData = await transform(listUsersData.Users);

			} catch (error) {
				// listuser error right after delete.
				// use this to avoid error in listuser response.
				console.log('err', error);
			}
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
					'Content-Range': `users ${start}-${end}/${usersCount}`,
				},
				body: JSON.stringify({
					data: resData,
					// total: usersCount,//resData.length,
					pageInfo: {
						hasPreviousPage: page > 1 ? true : false,
						hasNextPage: PaginationToken ? true : false,
					},
					PaginationToken
				}),
			};
		}
	} catch (e) {
		console.log('Catch an error: ', e)
		switch (e.name) {
			case 'InvalidPasswordException':
				errMsg = { type: 'exception', message: 'Invalid Password' };
				break;
			case 'UserNotFoundException':
				errMsg = { type: 'exception', message: 'User not found' };
				break;
			case 'UserNotConfirmedException':
				errMsg = { type: 'exception', message: 'User not confirmed' };
				break;
			case 'NotAuthorizedException':
				errMsg = { type: 'exception', message: 'Not authorized' };
				break;
			case 'TooManyRequestsException':
				errMsg = { type: 'exception', message: 'Too many requests' };
				break;
			case 'UsernameExistsException':
				errMsg = { type: 'exception', message: 'Username/email already exists' };
				break;
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
		headers: {
			'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
			'Access-Control-Expose-Headers': 'Content-Range',
		},
		body: JSON.stringify(errMsg),
	};
	return response;
};