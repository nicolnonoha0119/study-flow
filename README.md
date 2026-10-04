# StudyFlow v2

受験生向けAI学習計画アプリのプロトタイプです。

## 主な機能
- 今日の時間割と休憩管理
- 勉強タイマー → 実績時間を自動記録
- 科目別の予定・実績比較
- 疲労度・自由コメント
- コンディションを反映した再計画UI
- AI相談チャットUI
- 学習時間・実績ログのLocalStorage保存
- XP / レベル / バッジ
- 受験ロードマップ
- 数学・英語・化学・物理・研究の管理例

## GitHub / Vercel
GitHubにこのフォルダの中身をアップロードしてください。
Vercelでは Framework Preset を Vite、Build Command を `npm run build`、Output Directory を `dist` にします。

## ローカル起動
npm install
npm run dev

## 注意
現在は「動くフロントエンドプロトタイプ」です。本物の生成AI連携、Supabase等のクラウドDB、認証、長期的なAI学習モデルは次段階で接続します。
