#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkEc2ImageBuilderStack } from '../lib/cdk-ec2-imagebuilder-stack';

const envName = process.env.CDK_ENV || 'production';

const app = new cdk.App();
const config = app.node.tryGetContext(envName);

if (!config) {
  throw new Error(`Environment ${envName} is not defined in cdk.json`);
}

// 環境名の先頭を大文字に変換する関数
const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

// envName を Capitalize（例: "staging" → "Staging"）
const capitalizedEnv = capitalize(envName);

// ResourceName に結合
config.ResourceName = config.ResourceName + (envName !== 'production' ) ? capitalizedEnv : '';

new CdkEc2ImageBuilderStack(app, `CdkEc2ImageBuilderStack-${config.ResourceName}`, {
  ...config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
});
