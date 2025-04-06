import {
	PutItemCommand,
} from '@aws-sdk/client-dynamodb';

const samlurl = process.env.SAMLPROXY_API_URL;
const samlReloadUrl = process.env.SAMLPROXY_RELOAD_URL;

const postURL = `https://api.${process.env.AMFA_BASE_URL}/amfa`;

const updateSmtp = async (id, smtp) => fetch(postURL, {
	method: "POST",
	headers: {
		'Content-Type': 'application/json',
		'Accept': 'application/json',
		'Origin': `https://${process.env.AMFA_BASE_URL}`,
	},
	body: JSON.stringify({
		phase: 'adminupdatesmtp', tenantid: id, smtp
	}),
});

const taggleSaml = async (cognitoToken, enable) => {

	const response = await fetch(samlurl, {
		method: "PUT",
		cache: "no-cache",
		headers: {
			"Content-Type": "application/json",
			"Authorization": cognitoToken,
		},
		body: JSON.stringify({
			action: enable ? 'enable' : 'disable',
			clientId: process.env.SAML_CLIENTID,
		}), // body data type must match "Content-Type" header
	});
	console.log('samlslist put result', response);

	const res = await fetch(samlReloadUrl, {
		method: "GET", // *GET, POST, PUT, DELETE, etc.
		cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
		headers: {
			"Content-Type": "application/json",
			"Authorization": cognitoToken,
		},
	});
	const resTxt = await res.text();
	console.log('samlproxy reload result', res);
	console.log('samlproxy reload result text', resTxt);
}

export const putResData = async (payload, previousData, cognitoToken, dynamodb) => {
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


	if (payload.samlproxy !== previousData.samlproxy) {
		await taggleSaml(cognitoToken, payload.samlproxy)
	}

	const smtp = { host: previousData.host, port: previousData.port, user: previousData.user, pass: previousData.pass, secure: previousData.secure };
	const smtpChanged = smtp.host !== payload.host || smtp.port !== payload.port || smtp.user !== payload.user || smtp.pass !== payload.pass || smtp.secure !== payload.secure;
	if (smtpChanged) {
		const smtp = {
			host: payload.host,
			port: payload.port,
			user: payload.user,
			pass: payload.pass,
			secure: payload.secure ? 'true' : 'false',
		};
		await updateSmtp(payload.id, smtp);
	}

	return payload
}

export default putResData;