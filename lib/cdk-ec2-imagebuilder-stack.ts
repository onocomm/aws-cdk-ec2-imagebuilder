import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as imagebuilder from 'aws-cdk-lib/aws-imagebuilder';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

// カスタムプロパティの型を定義
interface CdkStackProps extends StackProps {
  ResourceName: string;
  ImageCreate: boolean;
  VpcId : string;
}

export class CdkEc2ImageBuilderStack extends Stack {
  constructor(scope: Construct, id: string, props?: CdkStackProps) {
    super(scope, id, props);

    // ✅ props が undefined の場合、エラーを回避
    if (!props) {
      throw new Error('props is required for CdkEc2Stack');
    }
    
    const {
      ResourceName,
      ImageCreate,
      VpcId,
    } = props;
    
    // ----------コンポーネント設定----------

    // ✅ コンポーネント定義ファイルを読み込む
    const componentData = fs.readFileSync(path.join(__dirname, '../components/ec2-component.txt'), 'utf8');

    // ✅ ImageBuilder用のコンポーネントを作成
    const component = new imagebuilder.CfnComponent(this, 'InstallComponent', {
      name: `${ResourceName}Component`,
      platform: 'Linux',
      version: '1.0.0',
      data: componentData,
    });

    // ----------インフラストラクチャー設定----------

    // ✅ ImageBuilder用のIAMロールを作成
    const imageBuilderRole = new iam.Role(this, 'ImageBuilderRole', {
      roleName: `${ResourceName}ImageBuilderRole`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        //iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ],
    });
    
    // ✅ インスタンスプロファイルの作成
    const instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      instanceProfileName: imageBuilderRole.roleName, // ✅ IAMロールと同じ名前を指定
      roles: [imageBuilderRole.roleName],
    });

    // ✅ VPCを取得
    const vpc = ec2.Vpc.fromLookup(this, 'ImportedVpc', (VpcId === 'default') ? { isDefault: true } : { vpcId: VpcId } );

    // ✅ 任意のサブネットを取得（パブリックサブネット）
    const subnet = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds[0];
    
    // ✅ セキュリティグループを作成（名前を指定）
    const securityGroup = new ec2.SecurityGroup(this, 'MySecurityGroup', {
      vpc,
      securityGroupName: `${props.ResourceName}SecurityGroup`, // ✅ 任意の名前を指定
      description: 'Allow EC2 ImageBuilder access',
      allowAllOutbound: true,
    });

    // ✅ Image Builder のインフラ設定を作成
    const infrastructureConfiguration = new imagebuilder.CfnInfrastructureConfiguration(this, 'InfraConfig', {
      name: `${ResourceName}InfrastructureConfiguration`,
      instanceProfileName: instanceProfile.ref,
      subnetId: subnet, // ✅ サブネットを指定
      securityGroupIds: [securityGroup.securityGroupId], // ✅ セキュリティグループを指定
      terminateInstanceOnFailure: true,
    });

    // ----------レシピ設定----------

    //  ✅ レシピを作成
    const recipe = new imagebuilder.CfnImageRecipe(this, 'Recipe', {
      name: `${ResourceName}Recipe`,
      version: '1.0.0',
      parentImage: `arn:aws:imagebuilder:${this.region}:aws:image/amazon-linux-2023-x86/x.x.x`, // Amazon Linux 2 AMI ID for ap-northeast-1
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
      name: `${ResourceName}DistributionConfiguration`,
      distributions: [
        {
          region: this.region,
          amiDistributionConfiguration: {
            amiTags: {
              Name: 'CustomAmazonLinux-AMI',
              Description: 'Custom Amazon Linux AMI with Apache and PHP',
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
      name: `${ResourceName}Pipeline`,
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
