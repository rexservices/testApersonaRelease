
//AWS configurations
import { DeleteGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

export const deleteResData = async (GroupName, cognitoISP) => {
	const params = {
		GroupName,
		UserPoolId: process.env.USERPOOL_ID,
	};

	const data = await cognitoISP.send(new DeleteGroupCommand(params));
	const item = data.Group;

	return {
		id: item.GroupName,
	};

};

export default deleteResData;