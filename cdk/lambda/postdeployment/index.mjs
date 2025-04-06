
import {
    CognitoIdentityProviderClient,
    SetUICustomizationCommand,
    DescribeUserPoolClientCommand,
    UpdateUserPoolClientCommand,
    DescribeUserPoolCommand,
    UpdateUserPoolCommand,
    AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';


const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const switchUserpoolTierToLite = async (UserPoolId) => {

    const describeUserPoolRes = await cognito.send(new DescribeUserPoolCommand({
        UserPoolId
    }));

    console.log('describeUserPoolRes:', describeUserPoolRes);

    const userPool = describeUserPoolRes.UserPool;

    if (!userPool) {
        throw new Error('UserPool not found');
    }

    if (userPool.UserPoolTier === 'LITE') {
        console.log('admin userpool tier is LITE already')
        return;
    }

    userPool.UserPoolTier = 'LITE';
    delete userPool.CreationDate;
    delete userPool.LastModifiedDate;
    delete userPool.EstimatedNumberOfUsers;
    delete userPool.Id;
    delete userPool.Status;

    const param = {
        UserPoolId,
        ...userPool,
    }

    return cognito.send(new UpdateUserPoolCommand(param));
}

export const handler = async (event) => {

    try {
        const logo_url = 'https://downloads.apersona.com/downloads/aPersona_Logos_Package/aPLogo-370x67.png';
        const response = await fetch(logo_url);
        const buf = await response.arrayBuffer();

        const res = await cognito.send(new SetUICustomizationCommand({
            UserPoolId: process.env.ADMINPOOL_ID,
            ClientId: process.env.CLIENT_ID,
            ImageFile: Buffer.from(buf),//blob,
        }))

        console.log('set ui customization res:', res);
    }
    catch (error) {
        console.error('set ui customization failed with:', error);
        console.error('RequestId: ' + error.requestId);
    }


    try {
        const res = await cognito.send(new DescribeUserPoolClientCommand({
            UserPoolId: process.env.USERPOOL_ID,
            ClientId: process.env.SAML_CLIENT_ID,
        }))

        let params = res.UserPoolClient;
        delete params.CreationDate;
        delete params.LastModifiedDate;
        delete params.ClientSecret;
        params.CallbackURLs.push(`${process.env.SAML_CALLBACK_URL}`);

        const response = await cognito.send(new UpdateUserPoolClientCommand(params))

        console.log('update userpoolclient result', response)
    }
    catch (error) {
        console.error('describe user pool client failed with:', error);
        console.error('RequestId: ' + error.requestId);
    }

    try {
        await switchUserpoolTierToLite(process.env.ADMINPOOL_ID);
    } catch (error) {
        console.error('switch userpool tier failed with:', error);
        console.error('RequestId: ' + error.requestId);
    }
};
