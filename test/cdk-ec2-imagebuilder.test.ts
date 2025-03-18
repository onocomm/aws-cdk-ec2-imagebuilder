import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CdkEc2ImageBuilderStack } from '../lib/cdk-ec2-imagebuilder-stack';

// モックでVpc.fromLookupを上書き
jest.mock('aws-cdk-lib/aws-ec2', () => {
  const originalModule = jest.requireActual('aws-cdk-lib/aws-ec2');
  return {
    ...originalModule,
    Vpc: {
      ...originalModule.Vpc,
      fromLookup: jest.fn().mockImplementation((scope, id, options) => {
        return originalModule.Vpc.fromVpcAttributes(scope, id, {
          vpcId: options.vpcId || 'vpc-mock',
          availabilityZones: ['dummy-az-1', 'dummy-az-2'],
          publicSubnetIds: ['subnet-mock-1', 'subnet-mock-2'],
        });
      }),
    },
  };
});

test('EC2 Image Builder Resources', () => {
  const app = new cdk.App();
  // スタック環境を指定
  const env = { 
    account: '123456789012', // テスト用のダミーアカウント
    region: 'us-east-1'      // テスト用のダミーリージョン
  };
  
  // WHEN
  const stack = new CdkEc2ImageBuilderStack(app, 'CdkEc2ImageBuilderStack', { 
    ResourceName: 'CdkEC2',
    env 
  });
  // THEN

  const template = Template.fromStack(stack);

  // VPCリソースは既存のものを使用するため、CloudFormationテンプレートには含まれない
  template.resourceCountIs('AWS::EC2::VPC', 0);

  // Image Builder リソースの検証
  template.resourceCountIs('AWS::IAM::Role', 1);
  template.resourceCountIs('AWS::IAM::InstanceProfile', 1);
  template.resourceCountIs('AWS::ImageBuilder::Component', 1);
  template.resourceCountIs('AWS::ImageBuilder::ImageRecipe', 1);
  template.resourceCountIs('AWS::ImageBuilder::InfrastructureConfiguration', 1);
  template.resourceCountIs('AWS::ImageBuilder::DistributionConfiguration', 1);
  template.resourceCountIs('AWS::ImageBuilder::ImagePipeline', 1);
  template.resourceCountIs('AWS::ImageBuilder::Image', 1);

  // セキュリティグループの検証
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    GroupDescription: 'Allow EC2 ImageBuilder access',
    VpcId: Match.anyValue()
  });
});
