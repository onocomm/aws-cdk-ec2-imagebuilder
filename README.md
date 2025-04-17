# AWS CDK EC2 ImageBuilder

このプロジェクトは、AWS CDKを使用してEC2 ImageBuilderを設定し、カスタムAMIを作成するためのインフラストラクチャコードを提供します。

## 概要

このプロジェクトでは、Amazon Linux 2023をベースとしたカスタムAMIを自動的に構築するためのパイプラインを作成します。作成されるAMIには、Apache HTTP Server、PHP 8.2、CloudWatch Agentなどが事前に設定されています。

## スタック構成

`CdkEc2ImageBuilderStack`は以下のリソースを作成します：

1. **EC2 ImageBuilder関連リソース**:
   - **イメージレシピ**: Amazon Linux 2023をベースに、以下のコンポーネントを順番に適用:
     - システムアップデート (update-linux)
     - PHP 8.2 (php-8-2-linux)
     - Amazon CloudWatch Agent (amazon-cloudwatch-agent-linux)
     - カスタムコンポーネント (components/ec2-component.txt)
     - 再起動テスト (reboot-test-linux)
   - **インフラストラクチャ設定**: イメージビルドに使用するEC2インスタンスの設定
   - **配布設定**: 生成されたAMIの共有と配布の設定
   - **パイプライン**: 上記のコンポーネントを組み合わせた自動ビルドパイプライン

2. **IAMリソース**:
   - EC2 ImageBuilder用のIAMロールとインスタンスプロファイル
   - 必要な権限を持つマネージドポリシーの適用

3. **ネットワーク設定**:
   - デフォルトVPCとパブリックサブネットの使用
   - アウトバウンド通信を許可するセキュリティグループ

4. **CloudWatch設定**:
   - 複数のログストリーム用のCloudWatch Logsグループ
   - CloudWatch Agent設定用のSSMパラメータ

5. **カスタム機能**:
   - Amazon SESを使用したメールリレー設定（オプション）
   - 管理用adminユーザーの作成（オプション）

## 環境変数と設定

スタックは以下の環境変数を使用して設定できます：

| 変数名 | デフォルト値 | 説明 |
|--------|--------------|------|
| ResourceName | "aws-cdk-ec2-imagebuilder" | リソース名のプレフィックス |
| Region | "ap-northeast-1" | デプロイするリージョン |
| ImageCreate | false | デプロイ時に自動的にイメージを作成するかどうか |
| Architecture | "arm64" | AMIのアーキテクチャ (arm64またはx86_64) |
| SESCredentials | "SESCredentials20250319" | SES認証情報を格納するSecrets Managerのシークレット名 |
| LogRemoval | true | スタック削除時にログを削除するかどうか |
| AdminUserCreate | true | adminユーザーを作成するかどうか |

## カスタマイズ方法

### コンポーネントのカスタマイズ

`components/ec2-component.txt`ファイルを編集することで、AMIに追加するカスタム設定やソフトウェアをカスタマイズできます。このファイルはYAML形式で、以下の主要な設定が含まれています：

- 基本的なユーティリティのインストール (rsyslog, cronie, postfix)
- タイムゾーン設定（Asia/Tokyo）
- スワップファイルの設定
- Apache HTTP Serverとその設定
- PHP 8.2とその拡張モジュール
- CloudWatch Agentの設定
- SESリレーの設定（Secrets Managerから認証情報を取得）
- 管理用adminユーザーの作成

### CloudWatch設定のカスタマイズ

`components/ssm-parameter.txt`ファイルを編集することで、CloudWatch Agentの監視対象やメトリクスの収集間隔などをカスタマイズできます。デフォルトでは以下のログとメトリクスを収集します：

- **ログ**:
  - システムログ (/var/log/messages)
  - Apacheアクセスログ (/var/log/httpd/access_log)
  - Apacheエラーログ (/var/log/httpd/error_log)
  - メールログ (/var/log/maillog)

- **メトリクス**:
  - ディスク使用率と空きiノード
  - ディスクI/O
  - メモリ使用率
  - ネットワーク接続状態
  - スワップ使用率

## 前提条件

- AWS CLIの設定とプロファイルの作成
- Node.js 14.x以上
- AWS CDK CLI (`npm install -g aws-cdk`)

## デプロイ手順

1. 依存関係のインストール:
   ```bash
   npm install
   ```

2. CDK環境の初期設定（初回のみ）:
   ```bash
   cdk bootstrap
   ```

3. CloudFormationテンプレートの合成:
   ```bash
   cdk synth
   ```

4. スタックのデプロイ:
   ```bash
   cdk deploy
   ```

5. （オプション）イメージの作成を有効にしてデプロイ:
   スタックの環境変数`ImageCreate`を`true`に設定して再デプロイします。

## よくある質問

### Q: SESリレーを設定するには？
A: AWS Secrets Managerに以下の形式でシークレットを作成してください：
```json
{
  "SESEndpoint": "email-smtp.ap-northeast-1.amazonaws.com",
  "SESAccessKey": "YOUR_SES_ACCESS_KEY",
  "SESSecretKey": "YOUR_SES_SECRET_KEY"
}
```
シークレット名は`SESCredentials20250319`またはスタックの環境変数で指定した名前を使用します。

### Q: 作成されるAMIのアーキテクチャを変更するには？
A: スタックの環境変数`Architecture`を`x86_64`または`arm64`に設定します。

### Q: adminユーザーの作成を無効にするには？
A: スタックの環境変数`AdminUserCreate`を`false`に設定します。

## トラブルシューティング

1. **パイプラインが失敗する場合**: CloudWatch LogsでImageBuilderのログを確認してください。ロググループ名は`/aws/imagebuilder/aws-cdk-ec2-imagebuilder`です。

2. **コンポーネントのエラー**: コンポーネントの構文や依存関係に問題がないか確認してください。

## その他のコマンド

* `npm run build`   TypeScriptをJavaScriptにコンパイル
* `npm run watch`   変更を監視して自動コンパイル
* `npm run test`    Jestを使用したユニットテストの実行
* `cdk diff`        デプロイ済みスタックと現在の状態を比較
* `cdk destroy`     スタックを削除
