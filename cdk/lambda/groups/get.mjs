
//AWS configurations
import { GetGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

export const getResData = async (GroupName, cognitoISP) => {

	const params = {
		GroupName,
		UserPoolId: process.env.USERPOOL_ID,
	};

	const data = await cognitoISP.send(new GetGroupCommand(params));
	const item = data.Group;

	return {
		id: item.GroupName,
		group: item.GroupName,
		creationDate: item.CreationDate,
		description: item.Description,
		lastModifiedDate: item.LastModifiedDate,
		precedence: item.Precedence,
	};

};

export default getResData;