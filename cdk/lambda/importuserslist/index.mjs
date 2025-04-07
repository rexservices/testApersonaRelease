//AWS configurations
import { ScanCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import postResData from "./post.mjs";

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.info("EVENT\n" + JSON.stringify(event, null, 2));

  //To get the list of Users in aws Cognito
  let errMsg = { type: "exception", message: "Service Error" };

  try {
    if (
      event.requestContext.http.method === "POST" &&
      (!event.queryStringParameters || !event.queryStringParameters.page)
    ) {
      // import users
      const body = JSON.parse(event.body);
      console.log("POST data: ", body);
      const postResult = await postResData(
        body,
        process.env.USERPOOL_ID,
        dynamoDBClient,
      );
      return postResult;
    } else {
      // get all user import jobs info from dynamodb
      console.log("GET data: ", event.queryStringParameters);

      if (
        event.queryStringParameters &&
        event.queryStringParameters.page &&
        parseInt(event.queryStringParameters.page) > 1 &&
        !event.body
      ) {
        const start =
          (parseInt(event.queryStringParameters.page) - 1) *
            parseInt(event.queryStringParameters.perPage) +
          1;
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Headers":
              "Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
            "Access-Control-Expose-Headers": "Content-Range",
            "Content-Range": `importuserslist ${start}-${start}/${0}`,
          },
          body: JSON.stringify({
            data: [],
            pageInfo: {
              hasPreviousPage: true,
              hasNextPage: false,
            },
            PaginationToken: null,
          }),
        };
      }

      let PaginationToken = null;

      if (
        event.queryStringParameters &&
        event.queryStringParameters.page &&
        parseInt(event.queryStringParameters.page) > 1 &&
        event.body
      ) {
        PaginationToken = event.body;
      }

      // scan dynamodb by userpoolId
      const FilterExpression = "userpoolid = :userpoolId";
      const ExpressionAttributeValues = {
        ":userpoolId": { S: process.env.USERPOOL_ID },
      };

      let scanParams = {
        TableName: process.env.IMPORTUSERS_JOB_ID_TABLE,
        ConsistentRead: true,
        // ...(PaginationToken && { ExclusiveStartKey: PaginationToken }),
        FilterExpression,
        ExpressionAttributeValues,
        // ProjectionExpression: "jobid, status, importedusers, failedusers, createdby, timestamp",
        Limit: 1000,//parseInt(event.queryStringParameters.perPage), // No of users to display per page
        ReturnConsumedCapacity: "NONE",
      };

      console.info("scanParams", scanParams);

      const listImportUsersJobData = await dynamoDBClient.send(
        new ScanCommand(scanParams),
      );
      console.log("listUserImportJobs result", listImportUsersJobData);

      let resData = listImportUsersJobData.Items;
      const page = parseInt(event.queryStringParameters.page);
      const perPage = parseInt(event.queryStringParameters.perPage);

      if (resData && resData.length > 0) {
        resData.sort((a, b) => {
          if (a.timestamp.N > b.timestamp.N) return -1;
          else return 1;
        });
      }
      else {
        resData = [];
      }

      const start = (page - 1) * perPage;
      const end = resData.length > start + perPage ? start + perPage : resData.length;
      const jobsCount = resData.length;


      console.log("start", start, "end", end, "page", page, "perPage", perPage, "resData.length", resData.length);

      // If no remaining jobs are there, no paginationToken is returned from cognito
      PaginationToken = (end >= resData.length) ? null : end;//listImportUsersJobData.LastEvaluatedKey;

      if (resData.length > start) {
        resData = resData.slice(start, end);
      }
      console.log("resData", resData);


      let res = []

      if (resData.length > 0) {
        res = resData.map((item) => {
          // console.log ('resdata item', item);
          let data = {}

          data.id = item.jobid.S;
          data.JobId = item.jobid.S;
          data.CreationDate = (new Date(parseInt(item.timestamp.N))).toUTCString();
          if (item.completiondate) {
            data.CompletionDate = (new Date(parseInt(item.completiondate.N))).toUTCString();
          }
          data.Status = item.jobstatus.S;
          if (item.failedusers) {
            let failedUsersNumber = 0;
            let FailureDetails = [];
            try {
              JSON.parse(item.failedusers.S).map((el) =>{
                failedUsersNumber++;
                FailureDetails.push(el);
              })
            }
            catch (e) {
              console.log("failedusers parse error: ", e);
            }
            data.FailedUsers = failedUsersNumber;
            data.FailureDetails = FailureDetails;
          }
          if (item.totalusers) {
              data.TotalUsers = parseInt(item.totalusers.N);
          }
          data.CreatedBy = item.createdby.S;
          return data;
        });
      }

      console.log("list user import jobs resData", res);

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Headers":
            "Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
          "Access-Control-Expose-Headers": "Content-Range",
          "Content-Range": `users ${start+1}-${end}/${jobsCount}`,
        },
        body: JSON.stringify({
          data: res,
          // total: usersCount,//resData.length,
          pageInfo: {
            hasPreviousPage: page > 1 ? true : false,
            hasNextPage: PaginationToken ? true : false,
          },
          PaginationToken,
          total: jobsCount,
        }),
      };
    }
  } catch (e) {
    console.log("Catch an error: ", e);
    switch (e.name) {
      case "InvalidPasswordException":
        errMsg = { type: "exception", message: "Invalid Password" };
        break;
      case "UserNotFoundException":
        errMsg = { type: "exception", message: "User not found" };
        break;
      case "UserNotConfirmedException":
        errMsg = { type: "exception", message: "User not confirmed" };
        break;
      case "NotAuthorizedException":
        errMsg = { type: "exception", message: "Not authorized" };
        break;
      case "TooManyRequestsException":
        errMsg = { type: "exception", message: "Too many requests" };
        break;
      case "UsernameExistsException":
        errMsg = {
          type: "exception",
          message: "Username/email already exists",
        };
        break;
      case "InvalidParameterException":
        errMsg = { type: "exception", message: "Invalid parameter" };
        break;
      default:
        errMsg = { type: "exception", message: "Service Error" };
        break;
    }
  }

  // TODO implement
  const response = {
    statusCode: 500,
    headers: {
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-Api-Key,Content-Range,X-Requested-With",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
      "Access-Control-Expose-Headers": "Content-Range",
    },
    body: JSON.stringify(errMsg),
  };
  return response;
};
