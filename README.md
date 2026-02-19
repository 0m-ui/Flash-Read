# ⚡ 英語瞬読アプリ (Eigo Shundoku)

英語チャンク・コロケーション・短文を瞬時に認識する「英語脳の視覚野」トレーニングアプリ。

---

## 🚀 セットアップ手順

### 1. リポジトリ準備

```bash
git clone https://github.com/YOUR_USERNAME/eigo-shundoku.git
cd eigo-shundoku
npm install
```

### 2. Firebase設定

1. [Firebase Console](https://console.firebase.google.com) でプロジェクト作成
2. **Authentication** → Sign-in method → **メール/パスワード** を有効化
3. **Firestore Database** → 本番モードで作成
4. プロジェクト設定 → アプリ追加（Web）→ 設定情報を確認
5. `src/firebase.js` の `firebaseConfig` を自分のものに置き換える：

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}
```

6. Firestore → ルール → `firestore.rules` の内容を貼り付けて公開

### 3. GitHub Pages 設定

1. `vite.config.js` の `base` をリポジトリ名に合わせる：
```js
base: '/eigo-shundoku/', // ← あなたのリポジトリ名に変更
```

2. `package.json` の `homepage` を追加（任意）：
```json
"homepage": "https://YOUR_USERNAME.github.io/eigo-shundoku/"
```

3. GitHub リポジトリの Settings → Pages → Source: **GitHub Actions** または **gh-pages branch**

### 4. ビルド & デプロイ

```bash
# ローカル開発
npm run dev

# GitHub Pages にデプロイ
npm run deploy
```

---

## 📋 Excel/CSV インポート フォーマット

| level | owner | importance | note | item1 | item2 | item3 | item4 | item5 |
|-------|-------|------------|------|-------|-------|-------|-------|-------|
| collocation | shared | 3 | 原因表現 | because of | due to | owing to | as a result | therefore |
| chunk | child | 2 | re-prefix | re- | rewrite | replay | return | review |
| sentence | shared | 3 | 基本文 | She reads every night. | He wrote a letter. | They play outside. | | |

**level**: `chunk` / `collocation` / `sentence`
**owner**: `shared` / `child` / `parent`  
**importance**: `3`(★★★) / `2`(★★) / `1`(★) / `0`(☆)

---

## 🏗 アーキテクチャ

```
src/
├── components/
│   ├── AuthScreen.jsx/.css    # ログイン・登録
│   ├── HomeScreen.jsx/.css    # 設定・セッション開始
│   ├── SessionScreen.jsx/.css # フラッシュ学習本体
│   ├── ManageScreen.jsx/.css  # データ管理・Excel取込
│   ├── StatsScreen.jsx/.css   # 成績・SRSダッシュボード
│   └── BottomNav.jsx          # ナビゲーション
├── hooks/
│   └── useFirebase.js         # Auth/WordSets/Records hooks
├── utils/
│   └── srs.js                 # 間隔反復アルゴリズム (SM-2簡易版)
├── data/
│   └── sampleData.js          # 準二級サンプルデータ
├── App.jsx                    # ルーティング
├── App.css                    # グローバルデザインシステム
├── firebase.js                # Firebase設定
└── main.jsx                   # エントリーポイント
```

---

## 📱 機能一覧

| 機能 | 説明 |
|------|------|
| 🔐 アカウント | 子供・保護者の2モード完全分離 |
| ⚡ フラッシュ学習 | 1〜5秒の瞬間提示 + カウントダウンバー |
| 🧠 自己採点 | タップで何個言えたか選択 |
| 📊 SRS | SM-2アルゴリズムで次回復習日を自動計算 |
| ⭐ 重要度フィルター | ★★★〜☆(0)で絞り込み |
| 📥 インポート | Excel/CSV一括登録 |
| 🗑 個別削除 | セットごとにUI上から削除 |
| 📈 成績可視化 | 正答率・学習量・進捗グラフ |
| ☁️ 同期 | Firebaseでマルチデバイス対応 |
| 📴 オフライン | Firebase未設定でもlocalStorage代替動作 |

---

## 🔐 セキュリティ

- Firestore Security Rules で「自分の記録は自分だけ書ける」を強制
- 共有WordSetsは全認証ユーザーが読み取り可能
- records は全認証ユーザーが読めるので親子クロスチェックが可能
