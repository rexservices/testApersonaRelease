import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminLinkProviderForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { getSMTP } from "./kmsUtil.mjs";

const cognitoISP = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});
const dynamodbISP = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3ISP = new S3Client({ region: process.env.AWS_REGION });
const lambda = new LambdaClient({ region: process.env.AWS_REGION });

const rateLimit = 25; // the amount inparral user creation //addusertogroup and linkprovider are 25 RPS.

const headers = {
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With",
  "Access-Control-Allow-Credentials": true,
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
};

const createUser = async (params, groups, UserPoolId) => {
  const assignApplications = async (Username) => {
    const promises = groups.map((group) =>
      cognitoISP.send(
        new AdminAddUserToGroupCommand({
          UserPoolId,
          GroupName: group,
          Username,
        }),
      ),
    );

    console.log("promises", promises);

    if (promises.length) {
      const resAddGroups = await Promise.allSettled(promises);
      console.log("resAddGroups", resAddGroups);
    }
  };

  console.log("admin create user params", params, "groups", groups);

  const resData = await cognitoISP.send(new AdminCreateUserCommand(params));
  const item = resData.User;

  console.log("resData", resData);

  if (item) {
    if (groups && groups.length > 0) {
      try {
        await assignApplications(item.Username);
      } catch (err) {
        console.log("create user - assignApplications/groups Error:", err);
      }
    }

    const userEmail = params.UserAttributes.find(
      (attr) => attr.Name === "email",
    )?.Value;
    try {
      await cognitoISP.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId,
          DestinationUser: {
            ProviderName: "Cognito",
            ProviderAttributeName: "email",
            ProviderAttributeValue: userEmail.toLowerCase(),
          },
          SourceUser: {
            ProviderName: "apersona",
            ProviderAttributeName: "email",
            ProviderAttributeValue: userEmail.toLowerCase(),
          },
        }),
      );
    } catch (err) {
      console.log("create user - AdminLinkProviderForUser Error:", err);
    }
  }
};

const sendResult = async (jobid, failedNum, totalNum, secret) => {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: secret.host,
    port: secret.port,
    secure: secret.secure === "true" || (secret.secure ? secret.secure : false),
    auth: {
      user: secret.user,
      pass: secret.pass,
    },
  });

  console.log("smtp test transporter:", {
    host: secret.host,
    port: secret.port,
    secure: secret.secure === "true" || (secret.secure ? secret.secure : false),
    auth: {
      user: secret.user,
      pass: secret.pass,
    },
  });
  try {
    // send mail with defined transport object
    const info = await transporter.sendMail({
      from: secret.user, // sender address
      to: secret.toUser, // list of receivers
      subject: "aPersona Identity AdminPortal Import User Job Completed", // Subject line
      text: `aPersona Identity Tenant ${process.env.TENANT_ID} user import job - ${jobid} has been accomplished.\n${totalNum - failedNum} of ${totalNum} users import successfully.\nYou may open admin portal to check details.`, // plain text body
      html: `<p>aPersona Identity Tenant ${process.env.TENANT_ID} user import job - ${jobid} has been accomplished.</p><p>${totalNum - failedNum} of ${totalNum} users import successfully.</p><p>You may open the admin portal to check details..</p>`, // html body
    });

    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.log("smtp test error message:", error.message);
    console.log("smtp test error stack:", error.stack);
  }
};

// input event format:
//   { jobid: jobid, tableName: tableName }
export const handler = async (event) => {
  const transformUserAttributes = (data) => {
    const groups = [];
    const attributes = [];

    Object.keys(data).map((key) => {
      switch (key.toLowerCase()) {
        case "locale":
        case "profile":
        case "given_name":
        case "family_name":
        case "name":
        case "middle_name":
        case "picture":
        case "gender":
        case "birthdate":
        case "address":
          if (data[key]) {
            attributes.push({ Name: key.toLowerCase(), Value: data[key] });
          }
          break;
        case "email":
          if (data[key]) {
            attributes.push({
              Name: key.toLowerCase(),
              Value: data[key].toLowerCase(),
            });
            attributes.push({ Name: "email_verified", Value: "true" });
          }
          break;
        case "phone_number":
          if (data[key]) {
            attributes.push({ Name: key.toLowerCase(), Value: data[key] });
            attributes.push({ Name: "phone_number_verified", Value: "true" });
          }
          break;
        // case 'email_verified':
        case "phone_number_verified":
          if (data[key]) {
            attributes.push({
              Name: key.toLowerCase(),
              Value: data[key] ? "true" : "false",
            });
          }
          break;
        case "groups":
          groups.push(...data[key]);
          break;
        case "alter-email":
        case "voice-number":
          if (data[key]) {
            attributes.push({ Name: `custom:${key}`, Value: data[key] });
          }
          break;
        default:
          break;
      }
      return key;
    });

    // to allow using email login, amfa has to set user email to verified
    attributes.push({ Name: "email_verified", Value: "true" });
    attributes.push({
      Name: "nickname",
      Value: data["given_name"] + " " + data["family_name"],
    });

    return { attributes, groups };
  };

  console.info("EVENT\n" + JSON.stringify(event, null, 2));
  const { notify, userpoolId, admin } = event;

  try {
    // get users csv content from dynamodb table.
    // table index is event.jobid, table name is event.tableName
    // get the csv content from dynamodb table, and convert to csv content string.
    const res = await s3ISP.send(
      new GetObjectCommand({
        Bucket: process.env.IMPORTUSERS_BUCKET,
        Key: `jobs/${event.jobid}`,
      }),
    );

    console.log("s3 get object res", res);

    const str = await res.Body.transformToString();
    console.log("str", str);
    let userData = JSON.parse(str);
    let restUserData = [];

    if (userData.length > 5000) {
      restUserData = userData.slice(5000);
      userData = userData.slice(0, 5000);
    }

    if (!userData || userData.length === 0) {
      const params = {
        TableName: event.tableName,
        Key: {
          jobid: { S: event.jobid },
        },
        UpdateExpression: "SET jobstatus = :st",
        ExpressionAttributeValues: {
          ":st": { S: "STOPPED/NO-DATA" },
        },
        ReturnValues: "ALL_NEW",
      };

      console.log("params", params);

      await dynamodbISP.send(new UpdateItemCommand(params));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ type: "exception", message: "No data found" }),
      };
    }

    if (restUserData.length > 0) {
      await s3ISP.send(
        new PutObjectCommand({
          Bucket: process.env.IMPORTUSERS_BUCKET,
          Key: `jobs/${event.jobid}`,
          Body: JSON.stringify(restUserData),
        }),
      );
    } else {
      await s3ISP.send(
        new DeleteObjectCommand({
          Bucket: process.env.IMPORTUSERS_BUCKET,
          Key: `jobs/${event.jobid}`,
        }),
      );
    }

    if (userData.length > rateLimit * 10) {
      // update job status to in progress
      const params = {
        TableName: event.tableName,
        Key: {
          jobid: { S: event.jobid },
        },
        UpdateExpression: "SET jobstatus = :st",
        ExpressionAttributeValues: {
          ":st": { S: "IN-PROGRESS" },
        },
        ReturnValues: "ALL_NEW",
      };

      console.log("params", params);

      try {
        const res = await dynamodbISP.send(new UpdateItemCommand(params));
        console.log("res", res);
      } catch (err) {
        console.log("err", err);
      }
    }

    // iterate the csv content one user by one user.
    // for each user, call cognito adminCreateUser API to create user in the userpool - process.env.USERPOOL_ID
    // Count and record successful users amount, count and record failed users amount and faild users' name in an array.

    // iterate the csv content to fetch user infos
    let i = 0;
    let promises = [];
    let failureResults = [];

    while (i < userData.length) {
      const data = userData[i];
      const { attributes, groups } = transformUserAttributes(data);
      const params = {
        Username: data["email"]
          .replace("@", "_")
          .replace(".", "_")
          .toLowerCase(),
        ...(!notify && { MessageAction: "SUPPRESS" }),
        UserAttributes: attributes,
        UserPoolId: userpoolId,
        DesiredDeliveryMediums: ["EMAIL"],
      };

      promises.push(createUser(params, groups, userpoolId));

      if (i > 0 && i % rateLimit === 0) {
        const importUserResults = await Promise.allSettled(promises);
        console.log("importUserResults: ", importUserResults);
        importUserResults.map((result, idx) => {
          if (result.status === "rejected") {
            console.log("create user error: ", result.reason);
            console.log(
              "item: ",
              userData[i - rateLimit + idx],
              "idx: ",
              idx,
              "i: ",
              i,
              "rateLimit: ",
              rateLimit,
            );
            return (result.username = userData[i - rateLimit + idx]["email"]);
          }
        });
        // count failure and success amount
        failureResults = [
          ...failureResults,
          ...importUserResults
            .filter((result) => result.status === "rejected")
            .map((item) => {
              return { username: item.username, reason: item.reason.name };
            }),
        ];

        promises.length = 0;
      }

      i += 1;
    }

    console.log('promises: ', promises);

    if (promises.length > 0 && userData.length > rateLimit * parseInt(i / rateLimit)) {
      const importUserResults = await Promise.allSettled(promises);
      importUserResults.map((result, idx) => {
        if (result.status === "rejected") {
          console.log("create user error: ", result.reason);
          console.log(
            "remain item: ",
            userData[rateLimit * parseInt(i / rateLimit) + idx],
            "idx: ",
            idx,
            "i: ",
            i,
            "rateLimit: ",
            rateLimit,
          );
          return (result.username =
            userData[rateLimit * parseInt(i / rateLimit) + idx]["email"]);
        }
      });
      console.log("importUserResults: ", importUserResults);
      // count failure and success amount
      failureResults = [
        ...failureResults,
        ...importUserResults
          .filter((result) => result.status === "rejected")
          .map((item) => {
            return { username: item.username, reason: item.reason.name };
          }),
      ];
    }

    console.log("failure results", failureResults);

    const historyRes = await dynamodbISP.send(
      new GetItemCommand({
        TableName: event.tableName,
        Key: {
          jobid: { S: event.jobid },
        },
      }),
    );

    const failedDetails = JSON.parse(historyRes.Item.failedusers.S);
    failureResults.forEach((result) => {
      failedDetails.push({
        reason: result.reason,
        username: result.username,
      });
    });

    const timestamp = Date.now();

    const params = {
      TableName: event.tableName,
      Key: {
        jobid: { S: event.jobid },
      },
      UpdateExpression:
        "SET jobstatus = :st, failedusers = :fu, completiondate = :co",
      ExpressionAttributeValues: {
        ":st": { S: restUserData.length > 0 ? "IN-PROGRESS" : "COMPLETED" },
        ":fu": { S: JSON.stringify(failedDetails) },
        ":co": { N: `${timestamp}` },
      },
      ReturnValues: "ALL_NEW",
    };

    console.log("params", params);

    try {
      const res = await dynamodbISP.send(new UpdateItemCommand(params));
      console.log("res", res);
    } catch (err) {
      console.log("err", err);
    }

    if (restUserData.length > 0) {
      const command = new InvokeCommand({
        FunctionName: process.env.IMPORTUSERS_WORKER_LAMBDA,
        InvocationType: "Event",
        Payload: JSON.stringify({
          jobid: event.jobid,
          notify,
          userpoolId,
          admin,
          tableName: process.env.IMPORTUSERS_JOB_ID_TABLE,
        }),
      });

      const response = await lambda.send(command);
      console.log("start new worker lambda response:", response);

      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({ message: "Import job started.", JobId: jobid }),
      };
    } else {
      //Todo: send email to admin
      if (admin) {
        let smtpRes = await getSMTP();
        smtpRes.toUser = admin;
        await sendResult(
          event.jobid,
          failedDetails.length,
          userData.length,
          smtpRes,
        );
      }
    }
  } catch (err) {
    console.log("err", err);
    const timestamp = Date.now();

    const params = {
      TableName: event.tableName,
      Key: {
        jobid: { S: event.jobid },
      },
      UpdateExpression: "SET jobstatus = :st, completiondate = :co",
      ExpressionAttributeValues: {
        ":st": { S: "ERRORER" },
        ":co": { N: `${timestamp}` },
      },
      ReturnValues: "ALL_NEW",
    };

    console.log("params", params);

    await dynamodbISP.send(new UpdateItemCommand(params));

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Failed to start import job." }),
    }
  }
}
