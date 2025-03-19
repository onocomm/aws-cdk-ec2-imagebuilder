# CDK TypeScript EC2 ImageBuilder

このプロジェクトでは、AWS CDKを使用してEC2 ImageBuilderを設定し、カスタムAMIを作成します。

## 構成内容

このスタック（`CdkEc2ImageBuilderStack`）は次のリソースを作成します：

1. **EC2 ImageBuilder関連**:
   - 指定順序でのAWS管理コンポーネント：
     1. update-linux
     2. php-8-2-linux
     3. amazon-cloudwatch-agent-linux
     4. 外部ファイル(`components/ec2-component.txt`)から読み込むカスタムコンポーネント
     5. reboot-test-linux（テスト用コンポーネント）
   - イメージレシピ、インフラストラクチャ設定、配布設定
   - AMI生成用のイメージパイプライン

2. **必要なIAMリソース**:
   - EC2 ImageBuilder用のIAMロールとインスタンスプロファイル（AdministratorAccessポリシーを持つ）

3. **ネットワーク設定**:
   - デフォルトVPCを使用
   - パブリックサブネットを使用
   - アウトバウンド通信を許可するセキュリティグループ

4. **CloudWatchAgent関連**:
   - SSM Parameter
   - CloudWatch Logs

## デプロイ前の準備

1. `components/ec2-component.txt` ファイルのコンポーネント定義をカスタマイズ
2. `components/ssm-parameter.txt` CloudWatchAgentの設定をカスタマイズ
3. 必要に応じて `lib/cdk-ec2-imagebuilder-stack.ts` のリソース名や設定をカスタマイズ

## デプロイ方法

```bash
cdk bootstrap   # CDKの初期セットアップ
cdk synth       # CloudFormationテンプレートを出力
cdk deploy      # AWSアカウントにスタックをデプロイ
```

デプロイ後は、出力される以下の情報を使用してAMIの詳細を確認できます：
- `AMI`: 生成されたAMIの詳細

## 生成されるAMIの特徴

生成されるAMIには以下がインストールされます：
- システムアップデート（update-linux）
- PHP 8.2（php-8-2-linux）
- Amazon CloudWatch Agent（amazon-cloudwatch-agent-linux）
- カスタム設定（ec2-component.txtで定義）

## その他のコマンド

* `npm run build`   TypeScriptをJavaScriptにコンパイル
* `npm run watch`   変更を監視して自動コンパイル
* `npm run test`    Jestを使用したユニットテストの実行
* `cdk diff`        デプロイ済みスタックと現在の状態を比較
