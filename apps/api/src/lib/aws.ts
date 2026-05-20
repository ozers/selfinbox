import { SESClient } from "@aws-sdk/client-ses";
import { S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION || "eu-west-1";

export const ses = new SESClient({ region });
export const s3 = new S3Client({ region });

export const S3_INBOUND_BUCKET = process.env.S3_INBOUND_BUCKET || "selfinbox-inbound";
export const SES_REGION = region;
