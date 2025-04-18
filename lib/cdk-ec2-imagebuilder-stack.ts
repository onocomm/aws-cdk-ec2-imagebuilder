import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as imagebuilder from 'aws-cdk-lib/aws-imagebuilder';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

export class CdkEc2ImageBuilderStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ----------環境変数設定----------

    // ✅ 環境変数を設定
    const ResourceName = "aws-cdk-ec2-imagebuilder";
    const Region = props?.env?.region || 'ap-northeast-1';
    const ImageCreate = false;
    const Architecture = "arm64";
    const SESCredentials = "SESCredentials20250319";
    const LogRemoval = true;
    const AdminUserCreate = true;

    // ----------CloudWatch Logs設定----------

    // ✅ CloudWatch Logs グループを作成（ファイルごとに設定）
    for(const logGroupName of [
      `/${ResourceName}/messages`,
      `/${ResourceName}/access_log`,
      `/${ResourceName}/error_log`,
      `/${ResourceName}/maillog`,
      `/aws/imagebuilder/${ResourceName}`,
    ]){

      new logs.LogGroup(this, `${logGroupName.replace(/\//g, '-')}-LogGroup`, {
        logGroupName: logGroupName,
        retention: logs.RetentionDays.FIVE_YEARS,
        removalPolicy: LogRemoval ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      });

    }
    
    // ----------SSMパラメータ設定----------

    // ✅ パラメータ定義ファイルを読み込む
    const paramData: string = fs.readFileSync(path.join(__dirname, '../components/ssm-parameter.txt'), 'utf8')
      .replace(/\${ResourceName}/g, ResourceName)
      .replace(/\${SESCredentials}/g, SESCredentials)
      .replace(/\${AdminUserCreate}/g, AdminUserCreate ? 'true' : 'false')
      .replace(/\${Region}/g, Region);

    // ✅ SSM パラメータを作成
    new ssm.StringParameter(this, 'CloudWatchAgentConfigParameter', {
      parameterName: `${ResourceName}EC2ImageBuilder`,  // ✅ SSM パラメータのキー
      stringValue: paramData,        // ✅ ファイルの内容を SSM に保存
      description: 'CloudWatch Agent Configuration for Postfix Relay',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ----------コンポーネント設定----------

    // ✅ コンポーネント定義ファイルを読み込む
    const componentData: string = fs.readFileSync(path.join(__dirname, '../components/ec2-component.txt'), 'utf8')
      .replace(/\${ResourceName}/g, ResourceName)
      .replace(/\${SESCredentials}/g, SESCredentials)
      .replace(/\${AdminUserCreate}/g, AdminUserCreate ? 'true' : 'false')
      .replace(/\${Region}/g, Region);

    // ✅ ImageBuilder用のコンポーネントを作成
    const component = new imagebuilder.CfnComponent(this, 'InstallComponent', {
      name: ResourceName,
      platform: 'Linux',
      version: '1.0.0',
      data: componentData,
    });

    // ----------インフラストラクチャー設定----------

    // ✅ ImageBuilder用のIAMロールを作成
    const imageBuilderRole = new iam.Role(this, 'ImageBuilderRole', {
      roleName: `${ResourceName}EC2ImageBuilder`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSImageBuilderReadOnlyAccess'),
      ],
    });
    
    // ✅ インスタンスプロファイルの作成
    const instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      instanceProfileName: imageBuilderRole.roleName, // ✅ IAMロールと同じ名前を指定
      roles: [imageBuilderRole.roleName],
    });

    // ✅ VPCを取得
    const vpc = ec2.Vpc.fromLookup(this, 'ImportedVpc', { isDefault: true } );

    // ✅ 任意のサブネットを取得（パブリックサブネット）
    const subnet = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds[0];
    
    // ✅ セキュリティグループを作成（名前を指定）
    const securityGroup = new ec2.SecurityGroup(this, 'MySecurityGroup', {
      vpc,
      securityGroupName: `${ResourceName}EC2ImageBuilder`, // ✅ 任意の名前を指定
      description: 'Allow EC2 ImageBuilder access',
      allowAllOutbound: true,
    });

    // ✅ Image Builder のインフラ設定を作成
    const infrastructureConfiguration = new imagebuilder.CfnInfrastructureConfiguration(this, 'InfraConfig', {
      name: ResourceName,
      instanceProfileName: instanceProfile.ref,
      subnetId: subnet, // ✅ サブネットを指定
      securityGroupIds: [securityGroup.securityGroupId], // ✅ セキュリティグループを指定
      terminateInstanceOnFailure: true,
    });

    // ----------レシピ設定----------

    //  ✅ レシピを作成
    const recipe = new imagebuilder.CfnImageRecipe(this, 'Recipe', {
      name: ResourceName,
      version: '1.0.0',
      parentImage: `arn:aws:imagebuilder:${this.region}:aws:image/amazon-linux-2023-${Architecture}/x.x.x`,
      components: [
        // ビルドコンポーネント（指定された順序で追加）
        {
          componentArn: `arn:aws:imagebuilder:${this.region}:aws:component/update-linux/x.x.x`,
        },
        {
          componentArn: `arn:aws:imagebuilder:${this.region}:aws:component/php-8-2-linux/x.x.x`,
        },
        {
          componentArn: `arn:aws:imagebuilder:${this.region}:aws:component/amazon-cloudwatch-agent-linux/x.x.x`,
        },
        {
          componentArn: component.attrArn,
        },
        {
          componentArn: `arn:aws:imagebuilder:${this.region}:aws:component/reboot-test-linux/x.x.x`,
        },
      ],
      additionalInstanceConfiguration: {
        systemsManagerAgent: {
          uninstallAfterBuild: false,
        },
      },
    });

    // ----------配布設定----------

    // ✅ 配布設定
    const distributionConfiguration = new imagebuilder.CfnDistributionConfiguration(this, 'DistributionConfig', {
      name: ResourceName,
      distributions: [
        {
          region: this.region,
          amiDistributionConfiguration: {
            amiTags: {
              Name: ResourceName,
              Description: 'Amazon Linux AMI with Apache and PHP',
            },
          },
        },
      ],
    });

    // ----------パイプライン設定----------

    // ✅ イメージテスト設定
    const imageTestsConfiguration = {
      imageTestsEnabled: true,
      timeoutMinutes: 60,
    };

    // ✅ イメージパイプラインを作成
    const pipeline = new imagebuilder.CfnImagePipeline(this, 'Pipeline', {
      name: ResourceName,
      infrastructureConfigurationArn: infrastructureConfiguration.attrArn,
      distributionConfigurationArn: distributionConfiguration.attrArn,
      imageRecipeArn: recipe.attrArn,
      imageTestsConfiguration,
    });

    new CfnOutput(this, 'ResultPipeline', {
      value: pipeline.attrArn,
      description: 'Pipelineの詳細',
    });

    // ----------イメージ作成----------

    // ✅ AMIを作成するかどうかを判定
    if(ImageCreate){

      // ✅ AMIを作成するためのイメージを作成
      const image = new imagebuilder.CfnImage(this, 'Image', {
        infrastructureConfigurationArn: infrastructureConfiguration.attrArn,
        distributionConfigurationArn: distributionConfiguration.attrArn,
        imageRecipeArn: recipe.attrArn,
        imageTestsConfiguration,
        tags: {
          Name: ResourceName,
        },
      });

      new CfnOutput(this, 'ResultAMI', {
        value: image.attrImageId,
        description: 'AMIの詳細',
      });
    }

  }
}
