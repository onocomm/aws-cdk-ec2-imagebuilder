#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkEc2ImageBuilderStack } from '../lib/cdk-ec2-imagebuilder-stack';

// AWSアカウントとリージョンを指定
const app = new cdk.App();
new CdkEc2ImageBuilderStack(app, 'CdkEc2ImageBuilderStack', {
  ResourceName: 'DessertChouxCom',
  SESEndpoint: 'email-smtp.ap-northeast-1.amazonaws.com',
  SESAccessKey: '',
  SESSecretKey: '',
  ImageCreate: false,
  VpcId: 'default',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
