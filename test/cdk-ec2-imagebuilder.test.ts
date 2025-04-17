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

// モックでファイル読み込みを上書き
jest.mock('fs', () => {
  return {
    ...jest.requireActual('fs'),
    readFileSync: jest.fn().mockImplementation((path) => {
      if (path.includes('ec2-component.txt')) {
        return 'name: Mock Component\nschemaVersion: 1.0\nphases:\n  - name: build\n    steps:\n      - name: MockStep\n        action: ExecuteBash\n        inputs:\n          commands:\n            - echo "Mock command"';
      }
      if (path.includes('ssm-parameter.txt')) {
        return '{"logs":{"logs_collected":{"files":{"collect_list":[{"file_path":"/var/log/messages","log_group_name":"${ResourceName}/messages"}]}}},"metrics":{}}';
      }
      return '';
    }),
  };
});

describe('CdkEc2ImageBuilderStack Tests', () => {
  // 環境変数
  const env = { 
    account: '123456789012',
    region: 'ap-northeast-1'
  };

  test('基本的なスタック構成のテスト - イメージ作成なし', () => {
    const app = new cdk.App();
    
    // ImageCreate: falseでスタックを作成
    const stack = new CdkEc2ImageBuilderStack(app, 'TestStack', {
      env: env
    });
    
    const template = Template.fromStack(stack);

    // CloudWatch Logs グループのテスト（5つのロググループが作成されることを確認）
    template.resourceCountIs('AWS::Logs::LogGroup', 5);
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 1825, // 5年
      LogGroupName: Match.stringLikeRegexp('/aws-cdk-ec2-imagebuilder/.*')
    });

    // SSMパラメータのテスト
    template.resourceCountIs('AWS::SSM::Parameter', 1);
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: Match.stringLikeRegexp('.*EC2ImageBuilder'),
      Type: 'String'
    });

    // ImageBuilder コンポーネントのテスト
    template.resourceCountIs('AWS::ImageBuilder::Component', 1);
    template.hasResourceProperties('AWS::ImageBuilder::Component', {
      Name: 'aws-cdk-ec2-imagebuilder',
      Platform: 'Linux',
      Version: '1.0.0'
    });

    // IAMロールとインスタンスプロファイルのテスト
    template.resourceCountIs('AWS::IAM::Role', 1);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: Match.stringLikeRegexp('.*EC2ImageBuilder'),
      ManagedPolicyArns: Match.arrayWith([
        Match.stringLikeRegexp('.*AmazonSSMManagedInstanceCore'),
        Match.stringLikeRegexp('.*EC2InstanceProfileForImageBuilder'),
        Match.stringLikeRegexp('.*AmazonSSMFullAccess'),
        Match.stringLikeRegexp('.*AmazonS3ReadOnlyAccess'),
        Match.stringLikeRegexp('.*SecretsManagerReadWrite'),
        Match.stringLikeRegexp('.*AWSImageBuilderReadOnlyAccess')
      ])
    });
    template.resourceCountIs('AWS::IAM::InstanceProfile', 1);

    // セキュリティグループのテスト
    template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Allow EC2 ImageBuilder access',
      SecurityGroupEgress: Match.arrayWith([
        Match.objectLike({
          CidrIp: '0.0.0.0/0'
        })
      ])
    });

    // インフラストラクチャ設定のテスト
    template.resourceCountIs('AWS::ImageBuilder::InfrastructureConfiguration', 1);
    template.hasResourceProperties('AWS::ImageBuilder::InfrastructureConfiguration', {
      Name: 'aws-cdk-ec2-imagebuilder',
      TerminateInstanceOnFailure: true
    });

    // イメージレシピのテスト
    template.resourceCountIs('AWS::ImageBuilder::ImageRecipe', 1);
    template.hasResourceProperties('AWS::ImageBuilder::ImageRecipe', {
      Name: 'aws-cdk-ec2-imagebuilder',
      Version: '1.0.0',
      Components: Match.arrayWith([
        Match.objectLike({
          ComponentArn: Match.stringLikeRegexp('.*update-linux/x.x.x')
        }),
        Match.objectLike({
          ComponentArn: Match.stringLikeRegexp('.*php-8-2-linux/x.x.x')
        }),
        Match.objectLike({
          ComponentArn: Match.stringLikeRegexp('.*amazon-cloudwatch-agent-linux/x.x.x')
        })
      ])
    });

    // 配布設定のテスト
    template.resourceCountIs('AWS::ImageBuilder::DistributionConfiguration', 1);
    template.hasResourceProperties('AWS::ImageBuilder::DistributionConfiguration', {
      Name: 'aws-cdk-ec2-imagebuilder',
      Distributions: Match.arrayWith([
        Match.objectLike({
          Region: 'ap-northeast-1',
          AmiDistributionConfiguration: Match.objectLike({
            AmiTags: {
              Name: 'aws-cdk-ec2-imagebuilder',
              Description: Match.anyValue()
            }
          })
        })
      ])
    });

    // イメージパイプラインのテスト
    template.resourceCountIs('AWS::ImageBuilder::ImagePipeline', 1);
    template.hasResourceProperties('AWS::ImageBuilder::ImagePipeline', {
      Name: 'aws-cdk-ec2-imagebuilder',
      ImageTestsConfiguration: {
        ImageTestsEnabled: true,
        TimeoutMinutes: 60
      }
    });

    // ImageCreate: falseの場合、Imageリソースは作成されない
    template.resourceCountIs('AWS::ImageBuilder::Image', 0);
  });

  test('イメージ作成ありのスタック構成のテスト', () => {
    const app = new cdk.App();
    
    // ImageCreate: trueでスタックを作成するため環境変数をオーバーライド
    const stackProps = {
      env: env,
      // envプロパティを明示的に渡すため、独自のproparationに依存せずに
      // テスト用の環境変数を設定
    };
    
    // constructor内でImageCreateを上書きするため、スパイを使用
    const originalStack = CdkEc2ImageBuilderStack;
    CdkEc2ImageBuilderStack.prototype.constructor = function(
      scope: cdk.App, 
      id: string, 
      props?: cdk.StackProps
    ) {
      // 元のコンストラクタを呼び出し
      originalStack.prototype.constructor.call(this, scope, id, props);
      // ImageCreateをtrueに設定（privateプロパティなのでこのようにハックする）
      // @ts-ignore: privateプロパティにアクセス
      this.ImageCreate = true;
    };
    
    const stack = new CdkEc2ImageBuilderStack(app, 'TestStackWithImage', stackProps);
    
    // スパイをリセット
    CdkEc2ImageBuilderStack.prototype.constructor = originalStack.prototype.constructor;
    
    const template = Template.fromStack(stack);

    // ImageCreate: trueの場合、Imageリソースが作成される
    template.resourceCountIs('AWS::ImageBuilder::Image', 1);
    template.hasResourceProperties('AWS::ImageBuilder::Image', {
      Tags: {
        Name: 'aws-cdk-ec2-imagebuilder'
      }
    });
    
    // CfnOutputも確認
    template.hasOutput('ResultAMI', {});
  });

  test('CloudWatch Logsグループの削除ポリシーのテスト', () => {
    const app = new cdk.App();
    
    // LogRemoval: trueでスタックを作成
    const stack = new CdkEc2ImageBuilderStack(app, 'TestStackWithLogRemoval', {
      env: env
    });
    
    const template = Template.fromStack(stack);

    // LogRemoval: trueの場合、ロググループの削除ポリシーはDelete
    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete'
    });
  });
});
