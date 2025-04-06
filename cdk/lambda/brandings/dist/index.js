"use strict";var l=Object.defineProperty;var m=Object.getOwnPropertyDescriptor;var N=Object.getOwnPropertyNames;var T=Object.prototype.hasOwnProperty;var h=(t,e)=>{for(var o in e)l(t,o,{get:e[o],enumerable:!0})},A=(t,e,o,d)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of N(e))!T.call(t,s)&&s!==o&&l(t,s,{get:()=>e[s],enumerable:!(d=m(e,s))||d.enumerable});return t};var I=t=>A(l({},"__esModule",{value:!0}),t);var P={};h(P,{handler:()=>w});module.exports=I(P);var a=require("@aws-sdk/client-s3"),c=require("@aws-sdk/client-cloudfront"),u=new a.S3Client({region:process.env.AWS_REGION}),C=new c.CloudFrontClient({region:process.env.AWS_REGION}),w=async t=>{console.info(`EVENT
`+JSON.stringify(t,null,2)),console.log("event.requestContext.http.method: ",t.requestContext.http.method);let e={"Access-Control-Allow-Headers":"Content-Type,Authorization,X-Api-Key,X-Requested-With","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"OPTIONS,GET,PUT"},o=(n=200,r)=>(console.log("return with:",{statusCode:n,headers:e,body:r}),{statusCode:n,headers:e,body:r}),d=t.headers.authorization,s={spportal:process.env.SPPORTAL_BUCKETNAME,adminportal:process.env.ADMINPORTAL_BUCKETNAME},O={spportal:process.env.SPPORTAL_DISTRIBUTION_ID,adminportal:process.env.ADMINPORTAL_DISTRIBUTION_ID},S=async(n,r)=>{let i={Bucket:s[n],Key:"branding.json"},y=await(await r.send(new a.GetObjectCommand(i))).Body.transformToString();return JSON.parse(y)},g=async(n,r,i)=>{let p={Bucket:s[n.id],Key:"branding.json",Body:JSON.stringify(n)};return await r.send(new a.PutObjectCommand(p)),await i.send(new c.CreateInvalidationCommand({DistributionId:O[n.id],InvalidationBatch:{CallerReference:Date.now().toString(),Paths:{Quantity:1,Items:["/branding.json"]}}})),n};try{switch(t.requestContext.http.method){case"GET":let n=await S(t.pathParameters?.id,u);return o(200,JSON.stringify({data:{url:process.env.SP_PORTAL_URL,...n}}));case"PUT":let r=JSON.parse(t.body),i=await g(r.data,u,C);return o(200,JSON.stringify({data:i}));case"OPTIONS":return o(200,JSON.stringify({data:"ok"}));default:return o(404,JSON.stringify({data:"Not Found"}))}}catch(n){console.log("Catch an error: ",n)}return{statusCode:500,headers:e,body:JSON.stringify({type:"exception",message:"Service Error"})}};0&&(module.exports={handler});
//# sourceMappingURL=index.js.map
