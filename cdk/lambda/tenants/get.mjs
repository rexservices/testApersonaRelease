import {
	GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const postURL = `https://api.${process.env.AMFA_BASE_URL}/amfa`;

const fetchAmfaSecrets = async (id) => fetch(postURL, {
	method: "POST",
	headers: {
		'Content-Type': 'application/json',
		'Accept': 'application/json',
		'Origin': `https://${process.env.AMFA_BASE_URL}`,
	},
	body: JSON.stringify({
		phase: 'admingetsecretinfo', tenantid: id
	}),
});

export const getResData = async (id, cognitoToken, dynamodb) => {

	//fetch tenant Info
	const params = {
		TableName: process.env.AMFATENANT_TABLE,
		Key: {
			id: { S: id },
		},
	};

	const result = await dynamodb.send(new GetItemCommand(params));

	console.log('get tenants result', result);

	const item = result.Item;


	const res = await fetchAmfaSecrets(id);
	const resJson = await res.json();

	console.log('get secret json from amfa', resJson);
	const smtp = resJson.message;
	smtp.secure = smtp.secure === 'true' ? true : false;

	if (item && item.name) {

		return {
			id,
			name: decodeURIComponent(item.name.S),
			contact: item.contact.S,
			url: item.url.S,
			endUserSpUrl: item.endUserSpUrl.S,
			samlproxy: item.samlproxy?.BOOL,
			samlIdPMetadataUrl: process.env.SAMLPROXY_METADATA_URL,
			adminApiUrl: `https://api.adminportal.${process.env.ROOT_DOMAIN_NAME}`,
			endUserSpRegion: process.env.AWS_REGION,
			endUserSpWebClientId: process.env.SP_PORTAL_CLIENT_ID,
			endUserSpUserpoolId: process.env.USER_POOL_ID,
			endUserSpOauthDomain: smtp.oauthdomain,
			...smtp,
			// branding: item.branding,
		};
	}

	throw new Error('Not Found!');
};

export default getResData;