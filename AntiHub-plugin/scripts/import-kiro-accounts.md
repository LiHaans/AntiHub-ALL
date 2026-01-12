# Kiro 账号批量导入脚本

批量导入 Kiro/BuilderId 账号到 AntiHub 数据库的脚本。

## 使用方法

```bash
# 进入项目目录
cd c:\Users\10467\Desktop\tool\kiro-all\AntiHub-ALL\AntiHub-plugin

# 运行导入命令
node scripts/import-kiro-accounts.js <JSON文件路径> [用户ID]
```

## 示例

```bash
# 使用默认用户（自动选择第一个活跃用户）
node scripts/import-kiro-accounts.js "C:\path\to\accounts.json"

# 指定用户ID
node scripts/import-kiro-accounts.js "C:\path\to\accounts.json" "d95a40f2-1091-xxxx"
```

## JSON 文件格式

脚本期望一个包含账号数组的 JSON 文件：

```json
[
  {
    "id": "xxx-xxx-xxx",
    "email": "xxx@email.com",
    "label": "账号名称",
    "status": "正常",
    "refreshToken": "aorAAAAA...",
    "accessToken": "aoaAAAAA...",
    "expiresAt": "2026/01/12 02:32:20",
    "provider": "BuilderId",
    "userId": "d-xxxx.xxx",
    "clientId": "xxx",
    "clientSecret": "xxx",
    "machineId": "xxx-xxx",
    "usageData": { ... }
  }
]
```

## 过滤规则

脚本会自动过滤无效账号：

| 条件 | 说明 |
|------|------|
| `status === '正常'` | 只导入状态正常的账号 |
| `refreshToken` 有值 | 必须有刷新令牌 |
| 唯一性检查 | 相同 userid 或 machineId 的账号会跳过 |

## 输出说明

```
读取到 150 个账号
过滤掉 50 个无效账号 (status 非正常或无 refreshToken)
准备导入 100 个有效账号到用户 xxx
---
[1/100] 处理: xxx@email.com
  导入成功: xxx@email.com
...
---
导入完成: 成功=95, 跳过=3, 失败=2, 过滤=50
```

| 状态 | 含义 |
|------|------|
| **成功** | 新增导入的账号 |
| **跳过** | 数据库中已存在 |
| **失败** | 导入时发生错误 |
| **过滤** | status 非正常或无 refreshToken |

## 字段映射

| JSON 字段 | 数据库字段 | 说明 |
|-----------|------------|------|
| `id` | `account_id` | 账号唯一ID |
| `email` | `email` | 邮箱 |
| `label` | `account_name` | 账号名称 |
| `provider: "BuilderId"` | `auth_method: "IdC"` | 认证方式 |
| `refreshToken` | `refresh_token` | 刷新令牌 |
| `accessToken` | `access_token` | 访问令牌 |
| `clientId` | `client_id` | 客户端ID |
| `clientSecret` | `client_secret` | 客户端密钥 |
| `machineId` | `machineid` | 机器码 |
| `userId` | `userid` | 用户ID |
| `usageData` | 多个字段 | 使用量信息 |

## 注意事项

1. **profile_arn**: 导入的 IdC 账号可能没有 `profile_arn`，系统会在首次使用时自动尝试获取
2. **token 过期**: 导入的 `accessToken` 可能已过期，系统会自动使用 `refreshToken` 刷新
3. **重复导入**: 重复运行脚本时，已存在的账号会被跳过，不会重复导入
