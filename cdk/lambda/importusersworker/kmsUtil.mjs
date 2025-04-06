import {
	SecretsManagerClient,
	GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({
	region: process.env.AWS_REGION,
});

export const getSMTP = async () => {
	const response = await client.send(
		new GetSecretValueCommand({
			SecretId: `apersona/${process.env.TENANT_ID}/smtp`,
		})
	);
	const secret = JSON.parse(response.SecretString);

	return secret;
}
